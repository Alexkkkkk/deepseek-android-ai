package com.example.deepseek.ui.chat

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.deepseek.data.ChatMessage
import com.example.deepseek.data.DeepSeekClient
import kotlinx.coroutines.launch

data class UiMessage(
    val role: String,
    val text: String,
    val isError: Boolean = false,
)

class ChatViewModel : ViewModel() {

    val messages = mutableStateListOf(
        UiMessage(
            role = "assistant",
            text = "Привет! Это Android-клиент DeepSeek Harness. Напишите сообщение — уйдёт в api.deepseek.com.",
        )
    )

    var input by mutableStateOf("")
        private set
    var isSending by mutableStateOf(false)
        private set

    fun onInputChange(value: String) {
        input = value
    }

    fun send() {
        val text = input.trim()
        if (text.isEmpty() || isSending) return

        messages += UiMessage(role = "user", text = text)
        input = ""
        isSending = true

        // История для API: системный промпт + вся переписка, кроме сообщений об ошибках.
        val history = buildList {
            add(ChatMessage("system", SYSTEM_PROMPT))
            messages.filterNot { it.isError }.forEach { add(ChatMessage(it.role, it.text)) }
        }

        viewModelScope.launch {
            val result = DeepSeekClient.complete(history)
            isSending = false
            if (result.error != null) {
                messages += UiMessage(role = "assistant", text = result.error, isError = true)
            } else {
                messages += UiMessage(role = "assistant", text = result.content.orEmpty())
            }
        }
    }

    fun clear() {
        if (isSending) return
        messages.removeAll { it.role != "assistant" || it.isError }
    }

    private companion object {
        const val SYSTEM_PROMPT =
            "Ты — ассистент внутри Android-приложения. Отвечай кратко и по делу, на языке пользователя."
    }
}
