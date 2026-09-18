# Android アプリ開発

Android アプリを開発する際の判断対象と確認先をまとめる。参考情報は調査の出発点であり、提案に先立って確認先で現行のガイダンスを確認する。

## UI 構築

判断対象: 画面を構築する UI ツールキットと、適用するデザインシステムの世代

確認先:

- [Jetpack Compose](https://developer.android.com/develop/ui/compose)
- [Material Design](https://m3.material.io/)

参考: 2026-09 時点では、Jetpack Compose が公式に推奨されている UI ツールキットであり、Material 3 の Expressive が Material Design の提供するデザインシステムとして利用できる。既存アプリで View ベースの実装が広範囲に残っている場合は、移行範囲を判断対象に含める。

## 実装言語

判断対象: アプリコードを記述する言語

確認先: [Kotlin on Android](https://developer.android.com/kotlin)

参考: 2026-09 時点では、Kotlin が公式に推奨されている言語である。
