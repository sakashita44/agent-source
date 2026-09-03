# ゲームエンジンを用いた開発

ゲームをエンジン上で開発するときの判断対象と確認先を収める。参考は調査の出発点であり、提案前に確認先で現行のガイダンスを確認する。

## エンジンの選定

判断対象: 対象プラットフォーム、ライセンス条件、既存資産に対して用いるエンジン

確認先:

- [Godot](https://docs.godotengine.org/en/stable/)
- [Unity](https://docs.unity3d.com/Manual/index.html)
- [Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine)

参考: エンジンごとに書き出し可能なプラットフォーム、ライセンスと収益条件、対応するスクリプト言語が異なる。これらは版の更新で変わるため、各エンジンの確認先で現行の条件を確認したうえで選ぶ。

## Godotの構成

### エンジンの版

判断対象: 使用するメジャー版と、参照するドキュメントの版

確認先: [Godot Docs](https://docs.godotengine.org/en/stable/)

参考: メジャー版の間でシーン構成、レンダリング、APIに互換性のない変更がある。対象プロジェクトが使用する版を`project.godot`で確認し、同じ版のドキュメントを参照する。

### スクリプト言語

判断対象: ゲームロジックを記述する言語と、ネイティブコードを組み込む方式

確認先:

- [GDScript](https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/index.html)
- [C#](https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/index.html)
- [GDExtension](https://docs.godotengine.org/en/stable/engine_details/engine_api/gdextension/index.html)

参考: 2026-09時点では、エンジンと統合されたGDScriptが既定の選択肢である。既存の.NETライブラリを利用する場合はC#、測定した性能制約に対処する場合はGDExtensionを判断対象に含める。C#を選ぶ場合は、対象プラットフォームへの書き出し可否を確認する。
