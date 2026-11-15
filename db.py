"""Banco SQLite: jogadores, partidas, quem participou de cada uma e saves.

Tudo num arquivo (dados/classic-games.db), sem servidor de banco: roda igual no PC e no Termux.
Horários são guardados em segundos desde 1970 (time.time()).
"""
import os
import sqlite3
import time
from contextlib import contextmanager

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("CG_DADOS") or os.path.join(BASE_DIR, "dados")   # CG_DADOS: outra pasta (ex.: testes)
DB_PATH = os.path.join(DATA_DIR, "classic-games.db")
SAVES_DIR = os.path.join(DATA_DIR, "saves")

# participação sem sinal de vida há mais que isso é considerada encerrada
INATIVO_SEG = 90
# ao voltar (tela apagou, aparelho dormiu), os jogadores do aparelho voltam juntos se faz menos que isso
RETOMAR_LOCAIS_SEG = 12 * 3600
# partida solo mais curta que isso é descartada (alguém só abriu e fechou o jogo)
SOLO_MINIMO_SEG = 20

SCHEMA = """
CREATE TABLE IF NOT EXISTS jogadores (
    id          TEXT PRIMARY KEY,          -- gerado no navegador, fica salvo no aparelho
    nome        TEXT NOT NULL,
    pin_hash    TEXT,                      -- PIN do login (com hash); vazio = jogador antigo sem PIN
    criado_em   INTEGER NOT NULL,
    visto_em    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS partidas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo          TEXT NOT NULL CHECK (tipo IN ('solo', 'netplay')),
    sala          TEXT,                    -- id da sala do netplay
    game_id       INTEGER NOT NULL,
    jogo          TEXT NOT NULL,
    console       TEXT NOT NULL,
    inicio        INTEGER NOT NULL,
    fim           INTEGER NOT NULL,
    ativa         INTEGER NOT NULL DEFAULT 1,
    placar        TEXT,
    vencedor_id   TEXT REFERENCES jogadores(id),
    empate        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_partidas_sala ON partidas(sala, ativa);
CREATE INDEX IF NOT EXISTS idx_partidas_inicio ON partidas(inicio);

CREATE TABLE IF NOT EXISTS participacoes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    partida_id  INTEGER NOT NULL REFERENCES partidas(id) ON DELETE CASCADE,
    jogador_id  TEXT NOT NULL REFERENCES jogadores(id),
    papel       TEXT NOT NULL CHECK (papel IN ('solo', 'anfitriao', 'convidado')),
    entrou      INTEGER NOT NULL,
    saiu        INTEGER NOT NULL,          -- atualizado a cada sinal de vida
    ativa       INTEGER NOT NULL DEFAULT 1,
    dono_id     INTEGER REFERENCES participacoes(id)  -- jogador 2+ no mesmo aparelho: segue esta
);
CREATE INDEX IF NOT EXISTS idx_part_partida ON participacoes(partida_id);
CREATE INDEX IF NOT EXISTS idx_part_jogador ON participacoes(jogador_id);

CREATE TABLE IF NOT EXISTS saves (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    jogador_id  TEXT NOT NULL REFERENCES jogadores(id),
    game_id     INTEGER NOT NULL,
    jogo        TEXT NOT NULL,
    criado_em   INTEGER NOT NULL,
    arquivo     TEXT NOT NULL,             -- caminho relativo a dados/saves/
    imagem      TEXT,                      -- captura de tela do momento do save
    automatico  INTEGER NOT NULL DEFAULT 0 -- 1 = save automático (só existe um por jogador e jogo)
);
CREATE INDEX IF NOT EXISTS idx_saves ON saves(jogador_id, game_id);
"""


def agora():
    return int(time.time())


@contextmanager
def conectar():
    """Uma conexão por operação; o 'with' faz commit (ou rollback se der erro)."""
    con = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        con.execute("BEGIN IMMEDIATE")
        yield con
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise
    finally:
        con.close()


def iniciar_banco():
    os.makedirs(SAVES_DIR, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA journal_mode = WAL")   # leituras não travam as escritas
    con.executescript(SCHEMA)
    # migração: bancos criados antes do login não têm a coluna do PIN
    colunas = {r[1] for r in con.execute("PRAGMA table_info(jogadores)")}
    if "pin_hash" not in colunas:
        con.execute("ALTER TABLE jogadores ADD COLUMN pin_hash TEXT")
    colunas = {r[1] for r in con.execute("PRAGMA table_info(participacoes)")}
    if "dono_id" not in colunas:
        con.execute("ALTER TABLE participacoes ADD COLUMN dono_id INTEGER REFERENCES participacoes(id)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_part_dono ON participacoes(dono_id, ativa)")
    colunas = {r[1] for r in con.execute("PRAGMA table_info(saves)")}
    if "automatico" not in colunas:
        con.execute("ALTER TABLE saves ADD COLUMN automatico INTEGER NOT NULL DEFAULT 0")
    con.execute("CREATE INDEX IF NOT EXISTS idx_jogadores_nome ON jogadores(nome COLLATE NOCASE)")
    con.commit()
    con.close()


# ---------- jogadores ----------

def buscar_por_nome(con, nome):
    """Nome não diferencia maiúsculas; se houver repetidos (antigos), pega o mais usado por último."""
    row = con.execute(
        "SELECT * FROM jogadores WHERE nome = ? COLLATE NOCASE ORDER BY visto_em DESC LIMIT 1", (nome,)
    ).fetchone()
    return dict(row) if row else None


def buscar_jogador(con, jogador_id):
    row = con.execute("SELECT id, nome FROM jogadores WHERE id = ?", (jogador_id,)).fetchone()
    return dict(row) if row else None


def criar_jogador(con, jogador_id, nome, pin_hash):
    t = agora()
    con.execute(
        "INSERT INTO jogadores (id, nome, pin_hash, criado_em, visto_em) VALUES (?, ?, ?, ?, ?)",
        (jogador_id, nome, pin_hash, t, t),
    )


def definir_pin(con, jogador_id, pin_hash):
    con.execute("UPDATE jogadores SET pin_hash = ?, visto_em = ? WHERE id = ?", (pin_hash, agora(), jogador_id))


def marcar_visto(con, jogador_id):
    con.execute("UPDATE jogadores SET visto_em = ? WHERE id = ?", (agora(), jogador_id))


# ---------- partidas e participações ----------

def encerrar_inativas(con):
    """Fecha participações de quem sumiu (aba fechada, celular desligado...)."""
    limite = agora() - INATIVO_SEG
    for row in con.execute(
        "SELECT id FROM participacoes WHERE ativa = 1 AND saiu < ?", (limite,)
    ).fetchall():
        encerrar_participacao(con, row["id"], marcar_saida=False)


def nova_participacao(con, jogador_id, jogo, sala=None, papel="solo"):
    """Abre uma participação: numa partida solo nova, ou na partida ativa da sala."""
    t = agora()
    partida_id = None
    if sala:
        row = con.execute(
            "SELECT id FROM partidas WHERE sala = ? AND ativa = 1 ORDER BY id DESC LIMIT 1", (sala,)
        ).fetchone()
        partida_id = row["id"] if row else None
    if partida_id is None:
        cur = con.execute(
            """INSERT INTO partidas (tipo, sala, game_id, jogo, console, inicio, fim)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("netplay" if sala else "solo", sala, jogo["game_id"], jogo["title"],
             jogo["console_label"], t, t),
        )
        partida_id = cur.lastrowid
    elif sala:
        # a partida passa a ser de netplay assim que alguém entra pela sala
        con.execute("UPDATE partidas SET tipo = 'netplay' WHERE id = ?", (partida_id,))
    cur = con.execute(
        """INSERT INTO participacoes (partida_id, jogador_id, papel, entrou, saiu)
           VALUES (?, ?, ?, ?, ?)""",
        (partida_id, jogador_id, papel, t, t),
    )
    return {"participacao_id": cur.lastrowid, "partida_id": partida_id}


def sinal_de_vida(con, participacao_id, jogador_id):
    t = agora()
    row = con.execute(
        "SELECT partida_id, jogador_id, ativa FROM participacoes WHERE id = ?", (participacao_id,)
    ).fetchone()
    if not row or not row["ativa"] or row["jogador_id"] != jogador_id:
        return False
    con.execute(
        "UPDATE participacoes SET saiu = ? WHERE (id = ? OR dono_id = ?) AND ativa = 1",
        (t, participacao_id, participacao_id),
    )
    con.execute("UPDATE partidas SET fim = MAX(fim, ?) WHERE id = ?", (t, row["partida_id"]))
    con.execute("UPDATE jogadores SET visto_em = ? WHERE id = ?", (t, row["jogador_id"]))
    return True


def encerrar_participacao(con, participacao_id, marcar_saida=True, jogador_id=None):
    """jogador_id: quando vem de um pedido do navegador, só o dono pode encerrar."""
    row = con.execute(
        "SELECT partida_id, jogador_id, ativa FROM participacoes WHERE id = ?", (participacao_id,)
    ).fetchone()
    if not row or not row["ativa"]:
        return
    if jogador_id is not None and row["jogador_id"] != jogador_id:
        return
    # quem joga no mesmo aparelho sai junto
    for local in con.execute(
        "SELECT id FROM participacoes WHERE dono_id = ? AND ativa = 1", (participacao_id,)
    ).fetchall():
        encerrar_participacao(con, local["id"], marcar_saida=marcar_saida)
    if marcar_saida:
        con.execute("UPDATE participacoes SET saiu = ? WHERE id = ?", (agora(), participacao_id))
    con.execute("UPDATE participacoes SET ativa = 0 WHERE id = ?", (participacao_id,))

    partida_id = row["partida_id"]
    ainda = con.execute(
        "SELECT COUNT(*) FROM participacoes WHERE partida_id = ? AND ativa = 1", (partida_id,)
    ).fetchone()[0]
    if ainda:
        return
    fim = con.execute(
        "SELECT MAX(saiu) FROM participacoes WHERE partida_id = ?", (partida_id,)
    ).fetchone()[0]
    con.execute("UPDATE partidas SET ativa = 0, fim = ? WHERE id = ?", (fim, partida_id))
    p = con.execute("SELECT tipo, inicio, fim, placar FROM partidas WHERE id = ?", (partida_id,)).fetchone()
    if p["tipo"] == "solo" and not p["placar"] and p["fim"] - p["inicio"] < SOLO_MINIMO_SEG:
        con.execute("DELETE FROM partidas WHERE id = ?", (partida_id,))


def jogadores_locais(con, dono_id):
    """Jogadores 2, 3, 4 ligados à participação de quem está logado no aparelho."""
    return [dict(r) for r in con.execute(
        """SELECT pa.id AS participacao_id, j.id AS jogador_id, j.nome
           FROM participacoes pa JOIN jogadores j ON j.id = pa.jogador_id
           WHERE pa.dono_id = ? AND pa.ativa = 1 ORDER BY pa.id""",
        (dono_id,),
    ).fetchall()]


def locais_para_retomar(con, participacao_id):
    """Jogadores do aparelho de uma participação que expirou (para trazer de volta ao reabrir)."""
    dono = con.execute("SELECT ativa, saiu FROM participacoes WHERE id = ?", (participacao_id,)).fetchone()
    if not dono:
        return []
    if dono["ativa"]:
        return jogadores_locais(con, participacao_id)
    if agora() - dono["saiu"] > RETOMAR_LOCAIS_SEG:
        return []
    # quem foi tirado pelo ✕ perde o vínculo (dono_id = NULL), então não volta
    return [dict(r) for r in con.execute(
        """SELECT MAX(pa.id) AS participacao_id, j.id AS jogador_id, j.nome
           FROM participacoes pa JOIN jogadores j ON j.id = pa.jogador_id
           WHERE pa.dono_id = ? GROUP BY j.id ORDER BY MIN(pa.id)""",
        (participacao_id,),
    ).fetchall()]


def remover_local(con, local_id):
    encerrar_participacao(con, local_id)
    con.execute("UPDATE participacoes SET dono_id = NULL WHERE id = ?", (local_id,))


def adicionar_local(con, dono_id, jogador_id):
    """Coloca mais um jogador (mesmo aparelho) na partida do dono."""
    dono = con.execute(
        "SELECT partida_id, jogador_id, ativa FROM participacoes WHERE id = ?", (dono_id,)
    ).fetchone()
    if not dono or not dono["ativa"]:
        raise ValueError("A sessão de jogo terminou. Recarregue a página.")
    if dono["jogador_id"] == jogador_id:
        raise ValueError("Esse jogador já está jogando aqui.")
    if any(l["jogador_id"] == jogador_id for l in jogadores_locais(con, dono_id)):
        raise ValueError("Esse jogador já está jogando aqui.")
    if len(jogadores_locais(con, dono_id)) >= 3:
        raise ValueError("Máximo de 4 jogadores por aparelho.")
    t = agora()
    con.execute(
        """INSERT INTO participacoes (partida_id, jogador_id, papel, entrou, saiu, dono_id)
           VALUES (?, ?, 'convidado', ?, ?, ?)""",
        (dono["partida_id"], jogador_id, t, t, dono_id),
    )


def participacao_do_jogador(con, participacao_id, jogador_id):
    row = con.execute("SELECT jogador_id FROM participacoes WHERE id = ?", (participacao_id,)).fetchone()
    return bool(row) and row["jogador_id"] == jogador_id


def partida_detalhe(con, partida_id):
    p = con.execute("SELECT * FROM partidas WHERE id = ?", (partida_id,)).fetchone()
    if not p:
        return None
    jogadores = con.execute(
        """SELECT j.id, j.nome, MIN(pa.papel) AS papel,
                  SUM(pa.saiu - pa.entrou) AS segundos
           FROM participacoes pa JOIN jogadores j ON j.id = pa.jogador_id
           WHERE pa.partida_id = ?
           GROUP BY j.id ORDER BY MIN(pa.entrou)""",
        (partida_id,),
    ).fetchall()
    return {**dict(p), "jogadores": [dict(j) for j in jogadores]}


def salvar_resultado(con, partida_id, placar, vencedor_id, empate):
    if vencedor_id:
        ok = con.execute(
            "SELECT 1 FROM participacoes WHERE partida_id = ? AND jogador_id = ?",
            (partida_id, vencedor_id),
        ).fetchone()
        if not ok:
            raise ValueError("O vencedor precisa ter jogado essa partida")
    con.execute(
        "UPDATE partidas SET placar = ?, vencedor_id = ?, empate = ? WHERE id = ?",
        (placar or None, None if empate else vencedor_id, 1 if empate else 0, partida_id),
    )


# ---------- saves ----------

def registrar_save(con, jogador_id, jogo, arquivo, imagem, automatico=False, criado_em=None):
    """Grava o save. O automático substitui o anterior: devolve (id, arquivos antigos para apagar)."""
    antigos = []
    if automatico:
        for row in con.execute(
            "SELECT id, arquivo, imagem FROM saves WHERE jogador_id = ? AND game_id = ? AND automatico = 1",
            (jogador_id, jogo["game_id"]),
        ).fetchall():
            antigos += [row["arquivo"], row["imagem"]]
            con.execute("DELETE FROM saves WHERE id = ?", (row["id"],))
    cur = con.execute(
        """INSERT INTO saves (jogador_id, game_id, jogo, criado_em, arquivo, imagem, automatico)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (jogador_id, jogo["game_id"], jogo["title"], criado_em or agora(), arquivo, imagem, 1 if automatico else 0),
    )
    return cur.lastrowid, [a for a in antigos if a]


def listar_saves(con, jogador_id, game_id):
    return [dict(r) for r in con.execute(
        """SELECT id, criado_em, imagem, automatico FROM saves WHERE jogador_id = ? AND game_id = ?
           ORDER BY automatico DESC, criado_em DESC""",
        (jogador_id, game_id),
    ).fetchall()]


def obter_save(con, save_id):
    row = con.execute("SELECT * FROM saves WHERE id = ?", (save_id,)).fetchone()
    return dict(row) if row else None


def apagar_save(con, save_id):
    con.execute("DELETE FROM saves WHERE id = ?", (save_id,))


# ---------- histórico e estatísticas ----------

def estatisticas(con):
    encerrar_inativas(con)
    jogadores = con.execute(
        """SELECT j.id, j.nome, j.visto_em,
                  COUNT(DISTINCT pa.partida_id) AS partidas,
                  COALESCE(SUM(pa.saiu - pa.entrou), 0) AS segundos,
                  (SELECT COUNT(*) FROM partidas p WHERE p.vencedor_id = j.id) AS vitorias
           FROM jogadores j LEFT JOIN participacoes pa ON pa.jogador_id = j.id
           GROUP BY j.id ORDER BY segundos DESC"""
    ).fetchall()
    jogos = con.execute(
        """SELECT jogo, console, COUNT(*) AS partidas,
                  SUM(fim - inicio) AS segundos,
                  SUM(tipo = 'netplay') AS em_grupo
           FROM partidas GROUP BY game_id ORDER BY segundos DESC LIMIT 10"""
    ).fetchall()
    duplas = con.execute(
        """SELECT a.nome AS jogador1, b.nome AS jogador2, COUNT(DISTINCT p.id) AS partidas
           FROM partidas p
           JOIN participacoes x ON x.partida_id = p.id
           JOIN participacoes y ON y.partida_id = p.id AND y.jogador_id > x.jogador_id
           JOIN jogadores a ON a.id = x.jogador_id
           JOIN jogadores b ON b.id = y.jogador_id
           WHERE p.tipo = 'netplay'
           GROUP BY x.jogador_id, y.jogador_id ORDER BY partidas DESC LIMIT 5"""
    ).fetchall()
    return {
        "jogadores": [dict(r) for r in jogadores],
        "jogos": [dict(r) for r in jogos],
        "duplas": [dict(r) for r in duplas],
    }


def partidas_recentes(con, limite=50):
    rows = con.execute(
        """SELECT p.*, v.nome AS vencedor,
                  GROUP_CONCAT(DISTINCT j.nome) AS nomes
           FROM partidas p
           LEFT JOIN jogadores v ON v.id = p.vencedor_id
           LEFT JOIN participacoes pa ON pa.partida_id = p.id
           LEFT JOIN jogadores j ON j.id = pa.jogador_id
           GROUP BY p.id ORDER BY p.inicio DESC LIMIT ?""",
        (limite,),
    ).fetchall()
    return [dict(r) for r in rows]
