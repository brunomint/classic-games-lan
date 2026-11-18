import java.util.Properties

// App Android do Fliperama de Casa: o mesmo servidor (Flask + EmulatorJS) rodando dentro do
// celular, com o Python do Chaquopy. O código do servidor NÃO é copiado para cá: na hora de
// compilar, a tarefa copiarServidor pega os arquivos da raiz do repositório e os coloca nos
// assets do app; na primeira vez que o servidor liga (ou depois de atualizar), o app os
// extrai para a pasta interna dele.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.chaquo.python")
}

val versao = "1.2.0"
val numeroVersao = 4

android {
    namespace = "io.github.brunomint.fliperama"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.brunomint.fliperama"
        minSdk = 24
        targetSdk = 35
        versionCode = numeroVersao
        versionName = versao
        ndk { abiFilters += listOf("arm64-v8a") }   // celulares; x86_64 só serviria para emulador de PC
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // assinatura: keystore.properties (fora do git); sem ela, sai com a chave de debug
            val props = rootProject.file("keystore.properties")
            if (props.exists()) {
                val p = Properties().apply { props.inputStream().use { load(it) } }
                signingConfig = signingConfigs.create("lancamento") {
                    storeFile = file(p.getProperty("storeFile"))
                    storePassword = p.getProperty("storePassword")
                    keyAlias = p.getProperty("keyAlias")
                    keyPassword = p.getProperty("keyPassword")
                }
            } else {
                signingConfig = signingConfigs.getByName("debug")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/servidor"))
}

chaquopy {
    defaultConfig {
        version = "3.10"   // igual ao Python do computador que compila (o pip roda nele)
        pip {
            install("-r", rootProject.file("../requirements.txt").path)
        }
    }
}

// núcleos de emulação que vão no app (os mesmos que vão no git)
val nucleos = listOf("snes9x", "fceumm", "mupen64plus_next", "mgba", "gambatte", "genesis_plus_gx", "pcsx_rearmed")

val copiarServidor by tasks.registering(Sync::class) {
    val raiz = rootProject.projectDir.parentFile
    from(raiz) {
        include("*.py", "LICENSE", "TERCEIROS.md", "templates/**", "static/**")
        include("emulatorjs/*", "emulatorjs/src/**", "emulatorjs/compression/**", "emulatorjs/localization/**")
        nucleos.forEach { include("emulatorjs/cores/$it-*", "emulatorjs/cores/reports/$it.json") }
        // as versões "thread" dos núcleos precisam de SharedArrayBuffer, que o navegador só libera
        // com cabeçalhos de isolamento que o servidor não manda: nunca são usadas
        exclude("**/__pycache__/**", "emulatorjs/*.map", "emulatorjs/cores/*-thread-*")
    }
    into(layout.buildDirectory.dir("generated/servidor/servidor"))
    // marca da versão: o app só extrai os arquivos de novo quando ela muda
    doLast {
        destinationDir.resolve("VERSAO").writeText("$versao-${System.currentTimeMillis()}")
    }
}
tasks.named("preBuild") { dependsOn(copiarServidor) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("com.google.zxing:core:3.5.3")
}
