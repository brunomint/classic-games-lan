package io.github.brunomint.fliperama

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import kotlin.concurrent.thread

/**
 * Tela do app: um botão Ligar/Desligar, o endereço para os outros aparelhos (com QR code) e
 * "Abrir aqui" para jogar no próprio celular. O estado vem de perguntar ao servidor se ele
 * responde (a cada 2 s), então a tela fica certa mesmo se ele for desligado pela notificação.
 */
class MainActivity : Activity() {
    private val loop = Handler(Looper.getMainLooper())
    private var noAr = false
    private var esperando = false
    private var ultimoEndereco: String? = null

    private lateinit var status: TextView
    private lateinit var botao: Button
    private lateinit var endereco: TextView
    private lateinit var dica: TextView
    private lateinit var qr: ImageView
    private lateinit var abrirAqui: Button
    private lateinit var pastaInfo: TextView
    private lateinit var pastaBotao: Button
    private var pediuPasta = false
    private lateinit var buscaInfo: TextView
    private lateinit var buscaBotao: Button
    private lateinit var buscaDesligar: Button
    private var procurando = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        status = findViewById(R.id.status)
        botao = findViewById(R.id.botao)
        endereco = findViewById(R.id.endereco)
        dica = findViewById(R.id.dica)
        qr = findViewById(R.id.qr)
        abrirAqui = findViewById(R.id.abrir_aqui)
        pastaInfo = findViewById(R.id.pasta_info)
        pastaBotao = findViewById(R.id.pasta_botao)
        pastaBotao.setOnClickListener { pedirPasta() }
        buscaInfo = findViewById(R.id.busca_info)
        buscaBotao = findViewById(R.id.busca_botao)
        buscaDesligar = findViewById(R.id.busca_desligar)
        buscaBotao.setOnClickListener { procurarJogos() }
        buscaDesligar.setOnClickListener {
            BuscaJogos.desligar(this)
            mostrarPasta()
        }

        botao.setOnClickListener { if (noAr) desligar() else ligar() }
        abrirAqui.setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("http://localhost:${Rede.PORTA}/")))
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        mostrar()
    }

    override fun onResume() {
        super.onResume()
        mostrarPasta()
        verificar()
    }

    /** "Acesso a todos os arquivos": para ler a pasta Fliperama de Casa do celular */
    private fun pedirPasta() {
        pediuPasta = true
        if (Build.VERSION.SDK_INT >= 30) {
            val porApp = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName"))
            try {
                startActivity(porApp)
            } catch (e: Exception) {
                startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            }
        } else {
            requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), 2)
        }
    }

    private fun mostrarPasta() {
        if (PastaJogos.temAcesso(this)) {
            val reiniciar = if (pediuPasta && noAr) getString(R.string.pasta_reiniciar) else ""
            pastaInfo.text = getString(R.string.pasta_ok, PastaJogos.NOME) + reiniciar
            pastaBotao.visibility = View.GONE
            mostrarBusca()
        } else {
            pastaInfo.setText(R.string.pasta_sem)
            pastaBotao.visibility = View.VISIBLE
            listOf(buscaInfo, buscaBotao, buscaDesligar).forEach { it.visibility = View.GONE }
        }
    }

    /** "Procurar jogos no celular": só aparece com o acesso aos arquivos liberado */
    private fun mostrarBusca() {
        buscaInfo.visibility = View.VISIBLE
        buscaBotao.visibility = View.VISIBLE
        buscaBotao.isEnabled = !procurando
        val r = BuscaJogos.ultimo(this)
        when {
            procurando -> buscaInfo.setText(R.string.busca_procurando)
            !BuscaJogos.ligada(this) || r == null -> buscaInfo.setText(R.string.busca_sem)
            r.jogos == 0 -> buscaInfo.setText(R.string.busca_nada)
            else -> buscaInfo.text = getString(R.string.busca_resultado, r.jogos, r.pastas)
        }
        val ligada = BuscaJogos.ligada(this)
        buscaBotao.setText(if (ligada) R.string.busca_de_novo else R.string.busca_ligar)
        buscaDesligar.visibility = if (ligada && !procurando) View.VISIBLE else View.GONE
    }

    private fun procurarJogos() {
        procurando = true
        mostrarBusca()
        thread {
            try {
                BuscaJogos.procurar(this)
            } catch (e: Exception) {
                // sem acesso ou pasta ilegível: fica como estava
            }
            runOnUiThread {
                procurando = false
                mostrarBusca()
            }
        }
    }

    override fun onPause() {
        super.onPause()
        loop.removeCallbacksAndMessages(null)
    }

    private fun verificar() {
        loop.removeCallbacksAndMessages(null)
        thread {
            val ok = Rede.servidorNoAr()
            val end = Rede.endereco()
            runOnUiThread {
                noAr = ok
                if (ok) esperando = false
                ultimoEndereco = end
                mostrar()
                loop.postDelayed({ verificar() }, 2000)
            }
        }
    }

    private fun ligar() {
        esperando = true
        mostrar()
        ContextCompat.startForegroundService(this, Intent(this, ServidorService::class.java))
    }

    private fun desligar() {
        startService(Intent(this, ServidorService::class.java).setAction(ServidorService.ACAO_PARAR))
        noAr = false
        mostrar()
    }

    private fun mostrar() {
        when {
            noAr -> {
                status.setText(R.string.ligado)
                botao.setText(R.string.desligar)
                val end = ultimoEndereco
                if (end != null) {
                    endereco.text = end
                    dica.setText(R.string.dica_endereco)
                    qr.setImageBitmap(gerarQr(end))
                    qr.visibility = View.VISIBLE
                } else {
                    endereco.setText(R.string.sem_wifi)
                    dica.setText(R.string.dica_sem_wifi)
                    qr.visibility = View.GONE
                }
                endereco.visibility = View.VISIBLE
                dica.visibility = View.VISIBLE
                abrirAqui.visibility = View.VISIBLE
            }
            else -> {
                status.setText(if (esperando) R.string.ligando else R.string.desligado)
                botao.setText(R.string.ligar)
                botao.isEnabled = !esperando
                endereco.visibility = View.GONE
                dica.visibility = if (esperando) View.VISIBLE else View.GONE
                dica.setText(R.string.dica_primeira_vez)
                qr.visibility = View.GONE
                abrirAqui.visibility = View.GONE
            }
        }
        if (noAr) botao.isEnabled = true
    }

    private fun gerarQr(texto: String): Bitmap {
        val lado = 600
        val m = QRCodeWriter().encode(texto, BarcodeFormat.QR_CODE, lado, lado, mapOf(EncodeHintType.MARGIN to 1))
        val px = IntArray(lado * lado) { i -> if (m[i % lado, i / lado]) Color.BLACK else Color.WHITE }
        return Bitmap.createBitmap(px, lado, lado, Bitmap.Config.ARGB_8888)
    }
}
