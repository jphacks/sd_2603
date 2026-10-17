# 出典・権利表示

取得確認日: 2026-10-18 (JST)。このディレクトリ配下の成果物は **Jevの判定精度を測定した結果ではない**。

## AMI Meeting Corpus

- 原著者・権利者: AMI Consortium; Jean Carletta and collaborators.
- 書誌: Carletta et al. (2005), *The AMI Meeting Corpus: A Pre-announcement*, Machine Learning for Multimodal Interaction. DOI: [10.1007/11677482_3](https://doi.org/10.1007/11677482_3).
- 公式概要: <https://groups.inf.ed.ac.uk/ami/corpus/overview.shtml>
- 公式配布・版: <https://groups.inf.ed.ac.uk/ami/download/>, manual annotations v1.6.2 (2017-04-10)。旧版と異なり、この版はCC BY 4.0。
- 原本: <https://groups.inf.ed.ac.uk/ami/AMICorpusAnnotations/ami_public_manual_1.6.2.zip>
- ライセンス: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), ZIP内の全文を `AMI-LICENCE.txt` に保存。
- 使用したのは人間が実際に話した**設定付きリモコン設計会議**。自然発生の業務会議・日本語会話と称さない。
- `ES2008a`–`ES2008d`等は同一課題系列。末尾a–dを除いた系列IDを分割キーにした。
- 会議種別の公式説明: <https://groups.inf.ed.ac.uk/ami/corpus/nonscenariomeetings.shtml>。non-scenarioという名前だけで自然発生会議と解釈しない。本データではscenarioのみ使用。

## AMI-ME

- 著者: Yihang Li and Chenhui Chu.
- 書誌: Li & Chu (2026), *Rethinking Meeting Effectiveness: A Benchmark and Framework for Temporal Fine-grained Automatic Meeting Effectiveness Evaluation*, ACL 2026. [論文](https://aclanthology.org/2026.acl-long.229/).
- 著者公式リポジトリ: <https://github.com/ku-nlp/AMI-ME>
- 固定コミット: `c04006257be6ba5cfdb570449a1d064d5e609671`。
- 固定JSON: <https://raw.githubusercontent.com/ku-nlp/AMI-ME/c04006257be6ba5cfdb570449a1d064d5e609671/AMI_ME.json>
- ライセンス: CC BY 4.0。固定版の著者LICENSEを `AMI-ME-LICENSE.txt` に保存。
- 利用: 著者の区間分割・発話本文・話者・秒時刻・会議タイプごとの事前設計目的。**話題名、区間の達成目的ラベル、人間の有効性点数は評価者に非公開**。
- 事前設計目的は各会議の実際のローカル議題を完全には記述しない。判断に足りない場合は不確実と記録する。
- 改変: 発話列の連続範囲を抽出し、出典情報・split・独自ラベルを追加。実会話の発話本文は翻訳・修正せず保持。日本語合成は別ファイルに明示して新規作成。
- 原本照合: AMI-ME JSONへの範囲一致は完全一致で確認。AMI公式XMLへの語彙所属・時刻照合は補助検査であり、逐語的な順序アラインメントの証明とは区別する。

## 派生成果物

実会話抜粋、合成例、独自ラベルは上記原典をクレジットしたCC BY 4.0派生成果物として扱う。新規合成・ラベル・操作定義の作成者は本リポジトリのJev tuning担当GPTセッションとサブエージェント。上記原著者がJevのラベル・尺度・精度を検証または支持したという意味ではない。人手の正解認定はしていない。配布時も本出典表示とライセンスを保持する。

研究背景に使った追加論文と適用範囲は `../rubric.md` を参照。96項目と数値アンカーは独自操作定義であり、論文由来の検証済みチェックリストではない。
