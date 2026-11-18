package io.github.brunomint.fliperama

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.Process
import android.util.Log
import androidx.core.app.NotificationCompat
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import java.io.File

/**
 * O servidor do Fliperama de Casa, num processo só dele (":servidor"), com notificação fixa.
 * Ligar: extrai os arquivos do servidor (se for a primeira vez ou o app foi atualizado) e roda
 * o Python. Desligar: encerra o processo inteiro (o servidor do Python não tem "parar").
 */
class ServidorService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var ligado = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACAO_PARAR) {
            parar()
            return START_NOT_STICKY
        }
        mostrarNotificacao(getString(R.string.ligando))
        if (!ligado) {
            ligado = true
            segurarAcordado()
            Thread({ rodarServidor() }, "servidor").start()
            Thread({ esperarNoAr() }, "aviso").start()
        }
        return START_NOT_STICKY
    }

    private fun rodarServidor() {
        try {
            val pasta = extrairServidor()
            val dados = File(filesDir, "dados").apply { mkdirs() }
            val jogos = PastaJogos.preparar(this, pasta)   // null: jogos dentro do app
            // busca pelas pastas do celular: refeita a cada Ligar, para achar os jogos novos
            if (jogos != null && BuscaJogos.ligada(this)) {
                try {
                    BuscaJogos.procurar(this)
                } catch (e: Exception) {
                    Log.w(TAG, "busca de jogos", e)
                }
            }
            if (!Python.isStarted()) Python.start(AndroidPlatform(this))
            Python.getInstance().getModule("fliperama_android").callAttr(
                "iniciar", pasta.absolutePath, dados.absolutePath, Rede.PORTA,
                jogos?.first?.absolutePath, jogos?.second?.absolutePath,
                BuscaJogos.arquivo(this).absolutePath
            )
        } catch (e: Throwable) {
            Log.e(TAG, "o servidor parou", e)
            mostrarNotificacao("Erro ao ligar: ${e.message?.take(80)}")
        }
    }

    /** quando o servidor responder, troca "Ligando…" pelo endereço */
    private fun esperarNoAr() {
        repeat(240) {
            if (Rede.servidorNoAr()) {
                mostrarNotificacao(Rede.endereco() ?: "Ligado (sem Wi-Fi)")
                return
            }
            Thread.sleep(500)
        }
    }

    /** copia assets/servidor para a pasta interna, só quando a marca VERSAO mudou */
    private fun extrairServidor(): File {
        val destino = File(filesDir, "servidor")
        val versao = assets.open("servidor/VERSAO").bufferedReader().use { it.readText().trim() }
        val marca = File(destino, "VERSAO")
        if (marca.exists() && marca.readText().trim() == versao) return destino
        mostrarNotificacao(getString(R.string.preparando))
        copiarAssets("servidor", destino)
        // roms/, bios/ e covers/ ficam: são do jogador, não do app
        listOf("roms", "bios", "covers").forEach { File(destino, it).mkdirs() }
        marca.writeText(versao)
        return destino
    }

    private fun copiarAssets(caminho: String, destino: File) {
        val filhos = assets.list(caminho) ?: emptyArray()
        if (filhos.isEmpty()) {
            destino.parentFile?.mkdirs()
            assets.open(caminho).use { entrada -> destino.outputStream().use { entrada.copyTo(it) } }
            return
        }
        destino.mkdirs()
        filhos.forEach { copiarAssets("$caminho/$it", File(destino, it)) }
    }

    private fun segurarAcordado() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fliperama:servidor").apply { acquire() }
        val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        @Suppress("DEPRECATION")
        val modo = if (Build.VERSION.SDK_INT >= 29) WifiManager.WIFI_MODE_FULL_LOW_LATENCY else WifiManager.WIFI_MODE_FULL_HIGH_PERF
        wifiLock = wm.createWifiLock(modo, "fliperama:wifi").apply { acquire() }
    }

    private fun parar() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wifiLock?.let { if (it.isHeld) it.release() }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        Process.killProcess(Process.myPid())
    }

    private fun mostrarNotificacao(texto: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(
                NotificationChannel(CANAL, getString(R.string.canal), NotificationManager.IMPORTANCE_LOW)
            )
        }
        val abrir = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        val desligar = PendingIntent.getService(
            this, 1, Intent(this, ServidorService::class.java).setAction(ACAO_PARAR), PendingIntent.FLAG_IMMUTABLE
        )
        val n: Notification = NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_notificacao)
            .setContentTitle(getString(R.string.ligado))
            .setContentText(texto)
            .setContentIntent(abrir)
            .addAction(0, getString(R.string.desligar), desligar)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ID_NOTIFICACAO, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(ID_NOTIFICACAO, n)
        }
    }

    companion object {
        const val ACAO_PARAR = "io.github.brunomint.fliperama.PARAR"
        private const val CANAL = "servidor"
        private const val ID_NOTIFICACAO = 1
        private const val TAG = "Fliperama"
    }
}
