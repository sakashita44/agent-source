# Androidアプリ開発

Androidアプリを開発するときの判断対象と確認先を収める。参考は調査の出発点であり、提案前に確認先で現行のガイダンスを確認する。

## UI構築

判断対象: 画面を構築するUIツールキットと、適用するデザインシステムの世代

確認先:

- [Jetpack Compose](https://developer.android.com/develop/ui/compose)
- [Material Design](https://m3.material.io/)

参考: 2026-09時点では、Jetpack Composeが公式の推奨するUIツールキットであり、Material 3のExpressiveがMaterial Designの提供するデザインシステムとして利用できる。既存アプリでViewベースの実装が広範に残る場合は、移行範囲を判断対象に含める。

## 実装言語

判断対象: アプリコードを記述する言語

確認先: [Kotlin on Android](https://developer.android.com/kotlin)

参考: 2026-09時点では、Kotlinが公式の推奨する言語である。
