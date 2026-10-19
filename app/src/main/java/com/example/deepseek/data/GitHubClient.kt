package com.example.deepseek.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * GitHub OAuth Device Flow 客户端。
 * 用法：
 * 1. 调用 startDeviceFlow() 获取 userCode 和 verificationUri，展示给用户。
 * 2. 用户浏览器授权后，调用 pollForToken() 轮询获取 token。
 * 3. 之后用 apiRequest() 调用任意 GitHub API。
 */
class GitHubClient(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("github_auth", Context.MODE_PRIVATE)

    companion object {
        // 替换为你自己 GitHub OAuth App 的 Client ID（在 GitHub Settings → Developer settings 创建）
        const val CLIENT_ID = "Ov23liXXXXXXXXXXXXXX" // ← 改成你的
        const val SCOPE = "repo read:user"
        const val API_BASE = "https://api.github.com"
    }

    data class DeviceFlowStart(
        val deviceCode: String,
        val userCode: String,
        val verificationUri: String,
        val interval: Int
    )

    /** 第一步：请求设备码。返回后把 userCode 和 verificationUri 展示给用户。 */
    fun startDeviceFlow(): DeviceFlowStart {
        val url = URL("https://github.com/login/device/code")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Accept", "application/json")
        conn.setRequestProperty("Content-Type", "application/json")
        conn.doOutput = true

        val body = JSONObject().apply {
            put("client_id", CLIENT_ID)
            put("scope", SCOPE)
        }
        OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }

        val response = conn.inputStream.bufferedReader().readText()
        val json = JSONObject(response)

        return DeviceFlowStart(
            deviceCode = json.getString("device_code"),
            userCode = json.getString("user_code"),
            verificationUri = json.getString("verification_uri"),
            interval = json.optInt("interval", 5)
        )
    }

    /**
     * 第二步：轮询直到用户授权完成，返回 access_token。
     * 阻塞调用，应在后台线程（如 viewModelScope / Dispatchers.IO）执行。
     */
    fun pollForToken(deviceCode: String, intervalSec: Int): String {
        var interval = intervalSec
        while (true) {
            Thread.sleep(interval * 1000L)

            val url = URL("https://github.com/login/oauth/access_token")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("Content-Type", "application/json")
            conn.doOutput = true

            val body = JSONObject().apply {
                put("client_id", CLIENT_ID)
                put("device_code", deviceCode)
                put("grant_type", "urn:ietf:params:oauth:grant-type:device_code")
            }
            OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }

            val response = conn.inputStream.bufferedReader().readText()
            val json = JSONObject(response)

            if (json.has("access_token")) {
                val token = json.getString("access_token")
                prefs.edit().putString("token", token).apply()
                return token
            }

            when (json.optString("error")) {
                "authorization_pending" -> continue // 用户还没授权，继续轮询
                "slow_down" -> interval += 5 // 加快轮询被警告，增加间隔
                else -> throw RuntimeException("OAuth 失败: ${json.optString("error")}")
            }
        }
    }

    /** 检查是否已保存 token。 */
    fun isAuthenticated(): Boolean = prefs.getString("token", null) != null

    /** 清除本地 token。 */
    fun signOut() = prefs.edit().remove("token").apply()

    /**
     * 调用 GitHub REST API。
     * @param method GET / POST / PATCH / DELETE
     * @param path 例如 "/repos/octocat/Hello-World/issues"
     * @param body 可选 JSON 字符串（POST/PATCH 时用）
     */
    fun apiRequest(method: String, path: String, body: String? = null): String {
        val token = prefs.getString("token", null)
            ?: throw IllegalStateException("未登录 GitHub，请先完成 Device Flow 授权")

        val conn = URL("$API_BASE$path").openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.setRequestProperty("Authorization", "Bearer $token")
        conn.setRequestProperty("Accept", "application/vnd.github+json")
        conn.setRequestProperty("User-Agent", "DeepSeekAndroidApp")
        conn.setRequestProperty("X-GitHub-Api-Version", "2022-11-28")

        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            OutputStreamWriter(conn.outputStream).use { it.write(body) }
        }

        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        return BufferedReader(InputStreamReader(stream)).readText()
    }
}
