// FLOW（手順・流れ）が適切な会話 9本。うち3本は途中切り出し版（@xx）つき。
// 注意: AI が書いた合成データで、ラベルも自分たちで付けている。実会議より整っているので結果は楽観的になる。
import { mk, withCuts } from "./build";
import type { CanvasSnippet } from "./types";

const approval = mk({
  id: "flow-approval",
  category: "flow",
  scenario: "経費精算の承認ルール（分岐＋差し戻し）",
  agenda: "経費精算の承認ルールの整理",
  label: "FLOW",
  window: { earliestTurn: 9, latestTurn: 12 },
  src: `
田中|経費精算の承認の流れ、いまいち曖昧なんで整理しましょう
高橋|あ、私まだよく分かってなくて
鈴木|まず本人が申請しますよね、システムに
田中|うん、で、上長が承認
鈴木|そう、上長。で、3万円超えるやつは部長も
高橋|あ、部長まで行くんですね
田中|はい。そのあと経理がチェックして
鈴木|証憑の確認ね。領収書とか
田中|それで問題なければ支払い処理、月末の振込
高橋|差し戻しはどうなります？
鈴木|経理で不備があったら本人に戻します
田中|OK、なるほど、じゃあその流れで周知しましょう
`,
  gold: {
    flow: {
      nodes: [
        { id: "n1", label: "本人が申請" },
        { id: "n2", label: "上長が承認" },
        { id: "n3", label: "部長が承認" },
        { id: "n4", label: "経理がチェック" },
        { id: "n5", label: "月末に振込" },
      ],
      edges: [
        { from: "n1", to: "n2" },
        { from: "n2", to: "n3", label: "3万円超" },
        { from: "n2", to: "n4", label: "3万円以下" },
        { from: "n3", to: "n4" },
        { from: "n4", to: "n5", label: "問題なし" },
        { from: "n4", to: "n1", label: "不備は差し戻し" },
      ],
    },
  },
});

const deploy = mk({
  id: "flow-deploy",
  category: "flow",
  scenario: "リリース手順（パイプライン＋ロールバック）",
  agenda: "リリース手順の確認",
  label: "FLOW",
  window: { earliestTurn: 9, latestTurn: 13 },
  src: `
山本|来週のリリース、手順って結局どうなってるんでしたっけ
中村|あー、ちょっと前に変わったんですよ
山本|え、そうなんですか
中村|まずPRを出して、レビューを通す
小林|で、マージしたらCIが走ります
中村|そう、CIが通ったらステージングに自動で上がる
山本|ステージングで確認するのは誰？
小林|QAの人が受け入れテストして
中村|OKが出たら、本番デプロイは手動で、リリース担当が実行
山本|もし本番で問題出たら？
中村|ロールバックですね、直前のバージョンに戻す
小林|ロールバック手順は別ドキュメントに
山本|了解です、助かりました
`,
  gold: {
    flow: {
      nodes: [
        { id: "n1", label: "PRレビュー" },
        { id: "n2", label: "CI実行" },
        { id: "n3", label: "ステージングで受入テスト" },
        { id: "n4", label: "本番デプロイ" },
        { id: "n5", label: "ロールバック" },
      ],
      edges: [
        { from: "n1", to: "n2", label: "マージ" },
        { from: "n2", to: "n3", label: "CI通過" },
        { from: "n3", to: "n4", label: "QAがOK" },
        { from: "n4", to: "n5", label: "問題発生時" },
      ],
    },
  },
});

const onboarding = mk({
  id: "flow-onboarding",
  category: "flow",
  scenario: "新入社員の初日（階層のある会議）",
  agenda: "新入社員の初日の流れ",
  label: "FLOW",
  src: `
人事 佐々木|来月入社の方の初日、流れを共有しますね
部長|お願いします
人事 佐々木|9時に受付で入館証を受け取ってもらって
部長|うん
人事 佐々木|そのあとPCとアカウントの受け渡し、情シスが担当です
新人 吉田|あ、私も聞いていいですか、初日って何時までですか
人事 佐々木|18時までです。午前中にオリエンテーションで、会社説明と規則の説明
部長|午後はうちの部で自己紹介してもらって
人事 佐々木|はい、そのあと席でアカウントのセットアップの続きですね
部長|歓迎会は別日だから、初日はそこまで
`,
  gold: {
    flow: {
      nodes: [
        { id: "n1", label: "受付で入館証を受け取る" },
        { id: "n2", label: "PC・アカウントの受け渡し" },
        { id: "n3", label: "オリエンテーション" },
        { id: "n4", label: "部内で自己紹介" },
        { id: "n5", label: "アカウントのセットアップ" },
      ],
      edges: [
        { from: "n1", to: "n2" },
        { from: "n2", to: "n3", label: "午前" },
        { from: "n3", to: "n4", label: "午後" },
        { from: "n4", to: "n5" },
      ],
    },
  },
});

const incident = mk({
  id: "flow-incident",
  category: "flow",
  scenario: "障害の初動（重大度で分岐）",
  agenda: "障害対応の一次対応フロー",
  label: "FLOW",
  window: { earliestTurn: 10, latestTurn: 12 },
  src: `
SRE 村上|障害のときの初動、改めて確認させてください
部長|うん、頼む
SRE 村上|まずアラートを検知したら、当番がトリアージします
開発 森|影響範囲と重大度の判断ね
SRE 村上|はい。重大度が高ければ、インシデントチャンネルを立てて関係者を招集
開発 森|低いやつは通常チケットでいいよね
SRE 村上|そうです。で、招集したら暫定対応、たとえば切り戻しとか
部長|暫定対応で復旧したら、お客様に連絡？
SRE 村上|はい、広報と相談して告知します
開発 森|そのあと恒久対応と、ポストモーテム
部長|ポストモーテムは1週間以内にね
SRE 村上|了解です
`,
  gold: {
    flow: {
      nodes: [
        { id: "n1", label: "検知・トリアージ" },
        { id: "n2", label: "関係者を招集" },
        { id: "n3", label: "暫定対応（切り戻し）" },
        { id: "n4", label: "お客様へ告知" },
        { id: "n5", label: "恒久対応・ポストモーテム" },
      ],
      edges: [
        { from: "n1", to: "n2", label: "重大度が高い" },
        { from: "n2", to: "n3" },
        { from: "n3", to: "n4", label: "復旧後" },
        { from: "n4", to: "n5" },
      ],
    },
  },
});

const order = mk({
  id: "flow-order",
  category: "flow",
  scenario: "注文処理（在庫で分岐して合流）",
  agenda: "注文処理の流れの整理",
  label: "FLOW",
  src: `
田中|注文が入ってからの処理、いまの流れをおさらいしたいです
吉岡|はい。まずWebから注文が入ると、自動で在庫を確認します
田中|在庫あるなしで分かれるんでしたよね
吉岡|あれば出荷準備に回って、倉庫がピッキングして梱包
加藤|在庫がなかったら？
吉岡|入荷待ちになって、お客様に入荷予定日をメールします
田中|入荷したら出荷準備に合流ですね
吉岡|そうです。出荷準備のあと配送業者に引き渡して、発送完了メール
加藤|発送完了メールまでが一連ですね
田中|はい、そこまで
`,
  gold: {
    flow: {
      nodes: [
        { id: "n1", label: "注文受付" },
        { id: "n2", label: "在庫確認" },
        { id: "n3", label: "出荷準備（ピッキング・梱包）" },
        { id: "n4", label: "入荷待ち（予定日を連絡）" },
        { id: "n5", label: "発送・完了メール" },
      ],
      edges: [
        { from: "n1", to: "n2" },
        { from: "n2", to: "n3", label: "在庫あり" },
        { from: "n2", to: "n4", label: "在庫なし" },
        { from: "n4", to: "n3", label: "入荷後" },
        { from: "n3", to: "n5" },
      ],
    },
  },
});

const refund = mk({
  id: "flow-refund",
  category: "flow",
  scenario: "返金の判断フロー（3分岐）",
  agenda: "返金対応の判断フロー",
  label: "FLOW",
  src: `
課長|返金の判断基準、担当によってバラバラなんでそろえたい
伊藤|いまは問い合わせが来たら、まず内容を確認してます
課長|そこからが人によって違う
伊藤|商品の不良なら全額返金です、送料込みで
中島|お客様都合は？
伊藤|未開封なら返品を受けて、商品代だけ返金
中島|開封済みは基本お断りですよね
課長|うん、例外は私が判断
伊藤|返金が決まったら経理に連携して振込、ですね
課長|OK、その流れでマニュアル作ろう
`,
  gold: {
    flow: {
      nodes: [
        { id: "n1", label: "問い合わせ内容の確認" },
        { id: "n2", label: "全額返金（送料込み）" },
        { id: "n3", label: "商品代のみ返金" },
        { id: "n4", label: "原則お断り" },
        { id: "n5", label: "経理に連携して振込" },
      ],
      edges: [
        { from: "n1", to: "n2", label: "商品の不良" },
        { from: "n1", to: "n3", label: "お客様都合・未開封" },
        { from: "n1", to: "n4", label: "お客様都合・開封済" },
        { from: "n2", to: "n5" },
        { from: "n3", to: "n5" },
      ],
    },
  },
});

const hiring = mk({
  id: "flow-hiring",
  category: "flow",
  scenario: "採用の選考フロー（役職が混ざる）",
  agenda: "今期の選考フローの確認",
  label: "FLOW",
  src: `
人事 西田|採用の選考フロー、今期の分を確認します
本部長|お願い
人事 西田|書類選考のあとに一次面接、ここは現場のリーダー
リーダー 森|はい
人事 西田|一次を通ったら適性検査
リーダー 加藤|オンラインですよね
人事 西田|そうです。で、そのあとが最終面接、本部長と役員
本部長|私と専務ね
人事 西田|最終を通過したら内定、条件面談はそのあとです
リーダー 森|内定承諾までの期限は？
人事 西田|1週間です
本部長|OK
`,
  gold: {
    flow: {
      nodes: [
        { id: "n1", label: "書類選考" },
        { id: "n2", label: "一次面接（現場リーダー）" },
        { id: "n3", label: "適性検査（オンライン）" },
        { id: "n4", label: "最終面接（本部長・専務）" },
        { id: "n5", label: "内定・条件面談" },
      ],
      edges: [
        { from: "n1", to: "n2" },
        { from: "n2", to: "n3", label: "通過" },
        { from: "n3", to: "n4" },
        { from: "n4", to: "n5", label: "通過" },
      ],
    },
  },
});

const hotfix = mk({
  id: "flow-hotfix",
  category: "flow",
  scenario: "緊急修正（速いテンポ・短い発言）",
  agenda: "緊急修正の手順の確認",
  label: "FLOW",
  src: `
中村|本番で不具合報告きたら、緊急修正どう動くんでしたっけ
吉田|まず報告を受けた人がチケット切って、再現確認
中村|再現できなかったら？
吉田|情報不足でユーザーに追加ヒアリング
小林|再現できたら修正して、レビューは簡略版で
中村|簡略版って、1人承認でOK？
小林|そう、1人でいい
吉田|それでテスト通したら本番反映
小林|反映したら事後報告をチャンネルに
中村|それで通常のリリースフローに修正を取り込む、と
吉田|ですね
`,
  gold: {
    flow: {
      nodes: [
        { id: "n1", label: "チケット化・再現確認" },
        { id: "n2", label: "修正" },
        { id: "n3", label: "簡易レビュー（1人承認）" },
        { id: "n4", label: "本番反映" },
        { id: "n5", label: "事後報告" },
      ],
      edges: [
        { from: "n1", to: "n2", label: "再現できた" },
        { from: "n2", to: "n3" },
        { from: "n3", to: "n4", label: "テスト通過" },
        { from: "n4", to: "n5" },
      ],
    },
  },
});

const escalation = mk({
  id: "flow-escalation",
  category: "flow",
  scenario: "サポートのエスカレーション",
  agenda: "サポートのエスカレーション手順",
  label: "FLOW",
  src: `
リーダー|エスカレーションのルールを決めたいです
斉藤|いまは一次対応のL1が受けて、解決しなければL2へ
リーダー|L2は技術サポートでしたっけ
斉藤|はい。L2で原因が特定できなければ開発チームに回す
青木|開発に回すときはチケットに再現手順をつける決まりですよね
斉藤|そうです。開発が修正して復旧したら
リーダー|お客様への連絡は誰が？
斉藤|最初に受けたL1が連絡して、クローズ
青木|なるほど
リーダー|じゃあその流れで文書化しましょう
`,
  gold: {
    flow: {
      nodes: [
        { id: "n1", label: "L1が一次対応" },
        { id: "n2", label: "L2（技術サポート）" },
        { id: "n3", label: "開発チームが修正" },
        { id: "n4", label: "L1がお客様へ連絡" },
        { id: "n5", label: "クローズ" },
      ],
      edges: [
        { from: "n1", to: "n2", label: "未解決" },
        { from: "n2", to: "n3", label: "原因不明" },
        { from: "n3", to: "n4", label: "復旧後" },
        { from: "n4", to: "n5" },
      ],
    },
  },
});

export const FLOW_SNIPPETS: CanvasSnippet[] = [
  ...withCuts(approval, [
    { turns: 4, label: "WAIT", note: "申請→上長承認まで。分岐や経理がまだ" },
    { turns: 8, label: "WAIT", note: "経理チェックまで。支払い・差し戻しがまだ" },
  ]),
  ...withCuts(deploy, [
    { turns: 3, label: "SILENCE", note: "導入の質問だけで、手順はまだ出ていない" },
    { turns: 8, label: "WAIT", note: "QAの受け入れテストまで。本番デプロイがまだ" },
  ]),
  onboarding,
  ...withCuts(incident, [
    { turns: 3, label: "SILENCE", note: "最初のステップが1つ出ただけ" },
    { turns: 7, label: "WAIT", note: "暫定対応まで。告知・恒久対応がまだ" },
  ]),
  order,
  refund,
  hiring,
  hotfix,
  escalation,
];
