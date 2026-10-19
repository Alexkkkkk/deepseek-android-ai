# DeepSeek Android

Android-клиент (Kotlin + Jetpack Compose) для **DeepSeek Harness (dsh)** — открытого
агентского харнесса от DeepSeek AI ([deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness), MIT).

## Что было скачано и что из этого сделано

Оригинальный `dsh` — это TypeScript/pnpm-монорепо (Node 22) с `pnpm`-workspace
`apps/{cli,desktop,desktop-host,web,plugin-market-generator}` + ~40 пакетами в `packages/`.
Android-кода в нём нет: десктопная часть собрана на Electron, веб-часть — на TS/React.

Перенос на Android сделан как **нативный клиент** к тому же бэкенду:

| В dsh (TypeScript) | Здесь (Android / Kotlin) |
|---|---|
| `apps/web` + `apps/desktop` (UI чата) | `ui/chat/ChatScreen.kt` — Compose-экран диалога |
| Состояние сессии/агента | `ui/chat/ChatViewModel.kt` — `ViewModel` + `StateFlow`-подобное состояние |
| `packages/api` (транспорт к модели) | `data/DeepSeekClient.kt` — `HttpURLConnection` + `org.json` |
| Тема/брендинг DSH | `ui/theme/Theme.kt` — синяя палитра, light/dark |

Сознательно без внешних зависимостей в сетевом слое: `HttpURLConnection` + `org.json`
входят в Android SDK, поэтому проект не тянет Retrofit/OkHttp и собирается быстрее.

## Структура

```
├── build.gradle.kts              # корневой скрипт, плагины apply false
├── settings.gradle.kts           # репозитории + :app
├── gradle/libs.versions.toml     # version catalog (AGP, Kotlin, Compose)
├── gradle/wrapper/               # обёртка Gradle 8.13
├── gradlew, gradlew.bat
└── app/
    ├── build.gradle.kts          # compileSdk 36, minSdk 24, R8 в release
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml   # INTERNET, MainActivity (launcher)
        ├── java/com/example/deepseek/
        │   ├── MainActivity.kt
        │   ├── data/DeepSeekClient.kt
        │   └── ui/
        │       ├── chat/ChatScreen.kt
        │       ├── chat/ChatViewModel.kt
        │       └── theme/Theme.kt
        └── res/values/           # strings.xml, themes.xml
```

## Версии

| Компонент | Версия |
|---|---|
| Android Gradle Plugin | 8.13.2 |
| Gradle | 8.13 |
| Kotlin | 2.4.21 |
| Compose BOM | 2026.06.01 |
| compileSdk / targetSdk | 36 |
| minSdk | 24 (Android 7.0) |
| JDK для сборки | 17 |

Версии библиотек подобраны по AAR-метаданным (`minCompileSdk=36`,
`minAndroidGradlePluginVersion=8.9.1`), чтобы они проходили проверку AGP 8.13.
Если обновляете Compose BOM на 2026.09.00+ или `core-ktx` до 1.19.x — потребуется
AGP 9.x (там Kotlin встроен в AGP, плагин `org.jetbrains.kotlin.android` больше не применяется).

## Сборка

```bash
# 1. ключ DeepSeek (НЕ коммитить)
echo "DEEPSEEK_API_KEY=sk-..." >> gradle.properties

# 2. SDK: файл local.properties с путём к Android SDK
echo "sdk.dir=/path/to/Android/Sdk" > local.properties

# 3. debug APK
./gradlew :app:assembleDebug
# результат: app/build/outputs/apk/debug/app-debug.apk

# release (R8 + shrinkResources, нужен keystore)
./gradlew :app:assembleRelease
```

Или просто открыть папку в Android Studio (Ladybug+/Narwhal+) и нажать Run.

## Настройка API

Ключ читается в `app/build.gradle.kts` из `gradle.properties` (`DEEPSEEK_API_KEY`)
или из переменной окружения и попадает в `BuildConfig.DEEPSEEK_API_KEY`.
Базовый URL — `https://api.deepseek.com/`, модель `deepseek-chat`.

`gradle.properties` и `local.properties` уже в `.gitignore`. Для публичного репозитория
ключ в `gradle.properties` — не лучшая практика: используйте `local.properties`
или CI-секрет.

## Статус

Каркас написан и закоммичен, но **APK в песочнице не собран**: Gradle-демон падал
(`daemon disappeared unexpectedly`) из-за 1.9 ГБ RAM на 2 ядрах — swap в окружении
запрещён. Синтаксис Kotlin/DSL не проверен компилятором: при первой сборке в
Android Studio возможны правки. Это черновик, а не проверенный релиз.

## Дальше можно добавить

- стриминг ответов (`stream: true` + SSE-парсер вместо `stream: false`);
- WebView-обёртку над `apps/web` dsh — если нужен полный агентский UI, а не только чат;
- локальную историю диалогов (Room);
- экран настроек с вводом ключа и выбором модели (`deepseek-chat` / `deepseek-reasoner`);
- foreground-сервис для длинных задач.

## Лицензия

Код этого клиента — MIT. Оригинальный DeepSeek Harness — MIT
([deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)).
