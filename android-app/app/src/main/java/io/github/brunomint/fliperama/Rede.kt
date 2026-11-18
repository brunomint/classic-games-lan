package io.github.brunomint.fliperama

import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL

/** Coisas de rede usadas pela tela e pelo serviço. */
object Rede {
    const val PORTA = 5000

    /**
     * IP deste celular na rede local. Prefere o Wi-Fi (wlan*) e, com o roteador do celular
     * ligado, a rede dele (ap*, swlan*); ignora dados móveis (rmnet*) e a interface local.
     */
    fun ipLocal(): String? {
        val candidatos = try {
            NetworkInterface.getNetworkInterfaces().toList()
                .filter { it.isUp && !it.isLoopback }
                .flatMap { nic -> nic.inetAddresses.toList().filterIsInstance<Inet4Address>().map { nic.name to it } }
                .filter { (_, ip) -> ip.isSiteLocalAddress }
        } catch (e: Exception) {
            emptyList()
        }
        fun peso(nome: String) = when {
            nome.startsWith("wlan") -> 0
            nome.startsWith("ap") || nome.startsWith("swlan") -> 1
            nome.startsWith("eth") -> 2
            nome.startsWith("rmnet") || nome.startsWith("ccmni") -> 9
            else -> 5
        }
        return candidatos.minByOrNull { peso(it.first) }?.second?.hostAddress
    }

    fun endereco(): String? = ipLocal()?.let { "http://$it:$PORTA" }

    /**
     * O servidor está respondendo? (bloqueia: chame fora da thread da tela). Pede um arquivo
     * pequeno, não a página inicial, que demora mais com muitos jogos.
     */
    fun servidorNoAr(): Boolean = try {
        val c = URL("http://127.0.0.1:$PORTA/static/css/base.css").openConnection() as HttpURLConnection
        c.connectTimeout = 1000
        c.readTimeout = 4000
        c.instanceFollowRedirects = false
        val ok = c.responseCode in 200..399
        c.disconnect()
        ok
    } catch (e: Exception) {
        false
    }
}
