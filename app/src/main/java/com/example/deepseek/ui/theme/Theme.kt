package com.example.deepseek.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DeepSeekBlue = Color(0xFF4D6BFE)

private val LightColors = lightColorScheme(
    primary = DeepSeekBlue,
    onPrimary = Color.White,
    secondary = Color(0xFF3B4C6B),
    background = Color(0xFFF7F8FC),
    surface = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF9DB0FF),
    onPrimary = Color(0xFF0B1B4D),
    secondary = Color(0xFFB9C4DC),
    background = Color(0xFF10131C),
    surface = Color(0xFF171B26),
)

@Composable
fun DeepSeekTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = MaterialTheme.typography,
        content = content,
    )
}
