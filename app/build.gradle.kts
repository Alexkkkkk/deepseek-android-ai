plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.example.deepseek"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.example.deepseek"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        vectorDrawables { useSupportLibrary = true }

        // API-ключ DeepSeek берётся из gradle.properties (DEEPSEEK_API_KEY=...)
        // или из переменной окружения. Не коммитьте ключ в репозиторий.
        val deepSeekApiKey = (project.findProperty("DEEPSEEK_API_KEY") as String?)
            ?: System.getenv("DEEPSEEK_API_KEY")
            ?: ""
        buildConfigField("String", "DEEPSEEK_API_KEY", "\"$deepSeekApiKey\"")
        buildConfigField("String", "DEEPSEEK_BASE_URL", "\"https://api.deepseek.com/\"")
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    // Compose: версии задаются BOM-ом, у библиотек ниже версия не указывается
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)

    debugImplementation(libs.androidx.ui.tooling)

    testImplementation(libs.junit)
}
