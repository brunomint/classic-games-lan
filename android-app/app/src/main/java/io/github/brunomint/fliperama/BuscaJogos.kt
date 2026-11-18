package io.github.brunomint.fliperama

import android.content.Context
import android.os.Environment
import org.json.JSONArray
import java.io.File

/**
 * Busca de jogos pelas pastas do celular (Download, Documentos, pastas de outros emuladores…).
 * Não move nem copia nada: grava em dados/achados.json a lista de pastas com jogos, e o
 * servidor (games.py, CG_ACHADOS) mostra esses jogos no menu lendo direto de onde estão.
 * Precisa do "Acesso a todos os arquivos", o mesmo da pasta Fliperama de Casa.
 */
object BuscaJogos {
    data class Resultado(val jogos: Int, val pastas: Int)

    // as mesmas regras do EXTS_ACHADOS de games.py: só extensões que não deixam dúvida
    private val EXTS = setOf(
        "sfc", "smc", "nes", "z64", "n64", "v64", "gba", "gb", "gbc", "md", "gen", "smd",
        "cue", "chd", "pbp",
    )
    private const val PROFUNDIDADE = 8
    private const val LIMITE_PASTAS = 20000
    private const val PREFS = "busca"

    fun arquivo(ctx: Context) = File(File(ctx.filesDir, "dados"), "achados.json")

    fun ligada(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("ligada", false)

    fun ultimo(ctx: Context): Resultado? {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return if (p.contains("jogos")) Resultado(p.getInt("jogos", 0), p.getInt("pastas", 0)) else null
    }

    fun desligar(ctx: Context) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit()
        arquivo(ctx).delete()
    }

    /** procura e grava a lista; chamar fora da linha da tela (pode levar alguns segundos) */
    fun procurar(ctx: Context): Resultado {
        val raiz = Environment.getExternalStorageDirectory()
        val pastaDoApp = PastaJogos.raiz().absolutePath
        val achadas = mutableListOf<String>()
        var jogos = 0
        var visitadas = 0

        fun visitar(pasta: File, nivel: Int) {
            if (visitadas++ > LIMITE_PASTAS) return
            val itens = pasta.listFiles() ?: return
            var aqui = 0
            for (item in itens) {
                if (item.isFile && ehJogo(item)) aqui++
            }
            if (aqui > 0) {
                achadas += pasta.absolutePath
                jogos += aqui
            }
            if (nivel >= PROFUNDIDADE) return
            for (item in itens) {
                if (!item.isDirectory || item.name.startsWith(".")) continue
                if (nivel == 0 && item.name == "Android") continue      // dados de outros apps
                if (item.absolutePath == pastaDoApp) continue           // já é lida pelo servidor
                visitar(item, nivel + 1)
            }
        }
        visitar(raiz, 0)

        val dados = arquivo(ctx)
        dados.parentFile?.mkdirs()
        val temp = File(dados.parentFile, "achados.json.tmp")
        temp.writeText(JSONArray(achadas).toString())
        temp.renameTo(dados)
        val r = Resultado(jogos, achadas.size)
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("ligada", true).putInt("jogos", r.jogos).putInt("pastas", r.pastas).commit()
        return r
    }

    private fun ehJogo(f: File): Boolean {
        val ext = f.extension.lowercase()
        if (ext in EXTS) return true
        // .zip só numa pasta com "snes" no caminho (como em games.py)
        return ext == "zip" && f.parentFile?.absolutePath?.lowercase()?.contains("snes") == true
    }
}
