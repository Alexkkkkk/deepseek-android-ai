package com.example.deepseek.data

import com.example.deepseek.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

/** Одно сообщение диалога. role: "system" | "user" | "assistant". */
data class ChatMessage(val role: String, val content: String)

data class ChatResult(val content: String? = null, val error: String? = null)

/**
 * Минимальный клиент DeepSeek Chat Completions.
 * Без внешних зависимостей: HttpURLConnection + org.json (входит в Android SDK).
 */
object DeepSeekClient {

    private const val ENDPOINT = "chat/completions"

    suspend fun complete(
        messages: List<ChatMessage>,
        apiKey: String = BuildConfig.DEEPSEEK_API_KEY,
        model: String = "deepseek-chat",
        temperature: Double = 1.0,
    ): ChatResult = withContext(Dispatchers.IO) {
        if (apiKey.isBlank()) {
            return@withContext ChatResult(
                error = "Не задан API-ключ. Добавьте DEEPSEEK_API_KEY в gradle.properties " +
                    "или в переменную окружения и пересоберите проект."
            )
        }

        val payload = JSONObject().apply {
            put("model", model)
            put("stream", false)
            put("temperature", temperature)
            put("messages", JSONArray().apply {
                messages.forEach { m ->
                    put(JSONObject().put("role", m.role).put("content", m.content))
                }
            })
        }

        var conn: HttpURLConnection? = null
        try {
            val url = URL(BuildConfig.DEEPSEEK_BASE_URL.trimEnd('/') + "/" + ENDPOINT)
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 30_000
                readTimeout = 120_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Authorization", "Bearer $apiKey")
            }

            conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val body = stream?.let { s ->
                BufferedReader(InputStreamReader(s, Charsets.UTF_8)).use { it.readText() }
            }.orEmpty()

            if (code !in 200..299) {
                val apiMessage = runCatching {
                    JSONObject(body).optJSONObject("error")?.optString("message")
                }.getOrNull()
                return@withContext ChatResult(
                    error = "HTTP $code: ${apiMessage?.takeIf { it.isNotBlank() } ?: body.take(300)}"
                )
            }

            val text = runCatching {
                JSONObject(body)
                    .getJSONArray("choices")
                    .getJSONObject(0)
                    .getJSONObject("message")
                    .getString("content")
            }.getOrNull()

            if (text.isNullOrBlank()) ChatResult(error = "Пустой ответ API: ${body.take(300)}")
            else ChatResult(content = text)
        } catch (e: Exception) {
            ChatResult(error = "Сеть недоступна: ${e.message ?: e::class.java.simpleName}")
        } finally {
            conn?.disconnect()
        }
    }
}
