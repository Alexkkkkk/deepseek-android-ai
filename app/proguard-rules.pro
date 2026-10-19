# Правила ProGuard/R8 для release-сборки.
-keepattributes *Annotation*, InnerClasses
-dontwarn kotlinx.**

# Сохраняем имена классов приложения (заготовка, можно убрать позже)
-keep class com.example.deepseek.** { *; }
