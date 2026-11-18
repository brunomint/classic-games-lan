package io.github.brunomint.fliperama

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout

/**
 * O Fliperama dentro do próprio app (sem abrir o navegador): tela cheia, tela sempre acesa e,
 * como o app se declara jogo, o Android e o modo de jogo do celular (Espaço de Jogos, Modo GT)
 * o tratam como tal. Só as páginas do servidor deste celular abrem aqui; links de fora vão
 * para o navegador.
 */
class JogoActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var raiz: FrameLayout
    private var telaCheia: View? = null
    private var telaCheiaFechar: WebChromeClient.CustomViewCallback? = null
    private var escolhaArquivo: ValueCallback<Array<Uri>>? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // desempenho constante (sem oscilar com o calor), nos aparelhos que oferecem
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (pm.isSustainedPerformanceModeSupported) window.setSustainedPerformanceMode(true)

        // depuração pelo Chrome do computador (chrome://inspect): só com a depuração do
        // Android ligada e o computador autorizado; serve para medir o desempenho
        WebView.setWebContentsDebuggingEnabled(true)

        raiz = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        web = WebView(this)
        raiz.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(raiz)
        esconderBarras()

        CookieManager.getInstance().setAcceptCookie(true)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // localStorage: ajustes do emulador, saves locais
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false   // som do jogo sem precisar tocar antes
            allowFileAccess = false
            allowContentAccess = true          // envio de ROMs pelo seletor de arquivos
            loadWithOverviewMode = true
            useWideViewPort = true
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val host = req.url.host
                if (host == "localhost" || host == "127.0.0.1") return false
                abrirFora(req.url)
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            // tela cheia do emulador (botão do jogo)
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                telaCheia?.let { callback.onCustomViewHidden(); return }
                telaCheia = view
                telaCheiaFechar = callback
                raiz.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                web.visibility = View.GONE
                esconderBarras()
            }

            override fun onHideCustomView() {
                telaCheia?.let { raiz.removeView(it) }
                telaCheia = null
                telaCheiaFechar = null
                web.visibility = View.VISIBLE
                esconderBarras()
            }

            // <input type="file"> da página Enviar ROMs
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                escolhaArquivo?.onReceiveValue(null)
                escolhaArquivo = callback
                return try {
                    startActivityForResult(params.createIntent(), PEDIDO_ARQUIVO)
                    true
                } catch (e: Exception) {
                    escolhaArquivo = null
                    false
                }
            }
        }
        web.setDownloadListener { url, _, _, _, _ -> abrirFora(Uri.parse(url)) }

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(intent?.dataString ?: "http://localhost:${Rede.PORTA}/")
    }

    @Deprecated("Activity.onActivityResult")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == PEDIDO_ARQUIVO) {
            escolhaArquivo?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            escolhaArquivo = null
            return
        }
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
    }

    @Deprecated("Activity.onBackPressed")
    override fun onBackPressed() {
        when {
            telaCheia != null -> telaCheiaFechar?.onCustomViewHidden()
            web.canGoBack() -> web.goBack()
            else -> {
                @Suppress("DEPRECATION")
                super.onBackPressed()
            }
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) esconderBarras()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    // o jogo pausa e salva sozinho quando a página some (autosave.js); aqui só repassa
    override fun onPause() {
        super.onPause()
        web.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    private fun abrirFora(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (e: Exception) {
            // nenhum app abre esse link
        }
    }

    /** tela cheia: some a barra de status e a de navegação (voltam com um deslize) */
    private fun esconderBarras() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
        }
    }

    companion object {
        private const val PEDIDO_ARQUIVO = 7
    }
}
