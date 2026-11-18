package io.github.brunomint.fliperama

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import java.io.File

/**
 * Pasta "Fliperama de Casa" no armazenamento do celular, com uma subpasta por console, para
 * quem prefere copiar os jogos pelo gerenciador de arquivos ou pelo cabo. Precisa da
 * permissão "Acesso a todos os arquivos" (Android 11+). Sem ela, os jogos ficam dentro do
 * app e chegam pela página Enviar ROMs.
 */
object PastaJogos {
    const val NOME = "Fliperama de Casa"
    private val CONSOLES = listOf("snes", "nes", "n64", "gba", "gb", "megadrive", "psx")

    fun raiz(): File = File(Environment.getExternalStorageDirectory(), NOME)
    fun capas(): File = File(raiz(), "capas")

    fun temAcesso(ctx: Context): Boolean =
        if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager()
        else ctx.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

    /**
     * Cria as pastas, explica no LEIA-ME o que vai em cada uma e traz para cá os jogos que
     * estavam dentro do app. Devolve (roms, bios), ou null sem a permissão.
     */
    fun preparar(ctx: Context, internaServidor: File): Pair<File, File>? {
        if (!temAcesso(ctx)) return null
        val raiz = raiz()
        val roms = File(raiz, "roms")
        val bios = File(raiz, "bios")
        CONSOLES.forEach { File(roms, it).mkdirs() }
        bios.mkdirs()
        if (!roms.isDirectory) return null
        File(raiz, "LEIA-ME.txt").takeIf { !it.exists() }?.writeText(
            """
            Fliperama de Casa: coloque os jogos na pasta do console, dentro de "roms".

              roms/snes       Super Nintendo    .sfc .smc .zip
              roms/nes        Nintendinho       .nes
              roms/n64        Nintendo 64       .z64 .n64 .v64
              roms/gba        Game Boy Advance  .gba
              roms/gb         Game Boy / Color  .gb .gbc
              roms/megadrive  Mega Drive        .md .gen .smd
              roms/psx        PlayStation       .bin + .cue, .chd, .pbp, .iso
              bios            BIOS do PlayStation: scph5501.bin

            Os jogos aparecem no menu sozinhos (recarregue a página).
            Use só cópias de jogos que você tem.
            """.trimIndent() + "\n"
        )
        mover(File(internaServidor, "roms"), roms)
        mover(File(internaServidor, "bios"), bios)
        // capas baixadas: ficam aqui para não sumirem se o app for reinstalado; o .nomedia
        // tira essas imagens da galeria de fotos
        val capas = File(raiz, "capas")
        capas.mkdirs()
        File(capas, ".nomedia").takeIf { !it.exists() }?.createNewFile()
        mover(File(internaServidor, "covers"), capas)
        anunciar(ctx, raiz)
        return roms to bios
    }

    /**
     * Avisa o Android dos arquivos da pasta: sem isso, gerenciadores de arquivos que leem o
     * índice de mídia não mostram as pastas nem os jogos (que foram criados direto no disco).
     */
    private fun anunciar(ctx: Context, raiz: File) {
        val arquivos = raiz.walkTopDown().onEnter { it.name != "capas" }
            .filter { it.isFile }.map { it.absolutePath }.toList()
        if (arquivos.isNotEmpty()) MediaScannerConnection.scanFile(ctx, arquivos.toTypedArray(), null, null)
    }

    /** move os arquivos de dentro do app para a pasta do celular (sem sobrescrever) */
    private fun mover(de: File, para: File) {
        de.listFiles()?.forEach { item ->
            val destino = File(para, item.name)
            if (item.isDirectory) {
                destino.mkdirs()
                mover(item, destino)
                item.delete()
            } else if (!destino.exists()) {
                try {
                    item.copyTo(destino)
                    item.delete()
                } catch (e: Exception) {
                    // fica onde estava; na próxima vez tenta de novo
                }
            }
        }
    }
}
