// 黙る／待つ／重複／判断が割れる会話（WAIT 5・SILENCE 12・重複 4・ambiguous 3）。
// 注意: AI が書いた合成データで、ラベルも自分たちで付けている。実会議より整っているので結果は楽観的になる。
import { mk } from "./build";
import type { CanvasSnippet } from "./types";

// ───────── WAIT：構造は出てきたが、まだ足りない ─────────
const WAIT_SNIPPETS: CanvasSnippet[] = [
  mk({
    id: "wait-steps-incomplete",
    category: "wait",
    scenario: "手順を話し始めたが途中で止まる",
    agenda: "入会手続きの流れ",
    label: "WAIT",
    src: `
受付|入会の手続きなんですが、まず申込書を書いてもらって
上長|うん
受付|それから本人確認を
上長|ほかには？
受付|えーと、あとは…ちょっと待ってください、資料を見ます
上長|はい
`,
  }),
  mk({
    id: "wait-options-listing",
    category: "wait",
    scenario: "候補を挙げている最中で、比べる中身がない",
    agenda: "ツール選定の候補出し",
    label: "WAIT",
    src: `
鈴木|候補はまずAですね、有名なやつ
田中|あとBもあるよ
鈴木|あー、Bもか。ほかには？
佐藤|Cも一応あるんですけど、まだ調べてなくて
田中|それと、Dもあった気がする
鈴木|比べる軸はまだ決めてないけど、とりあえず出そうか
`,
  }),
  mk({
    id: "wait-flow-unknown-step",
    category: "wait",
    scenario: "流れの途中で担当者が分からず確認中",
    agenda: "請求書発行の手順",
    label: "WAIT",
    src: `
経理|請求書は、まず営業から売上報告が来て
課長|うん
経理|そのあと私が請求書を作って、で、次に…誰だっけ、承認
課長|私か、部長かな
経理|ちょっと確認しないと分かんないです
課長|あとで調べて共有するよ
`,
  }),
  mk({
    id: "wait-compare-two-of-three",
    category: "wait",
    scenario: "3候補のうち2つだけ判明、残りは明日",
    agenda: "ベンダー選定",
    label: "WAIT",
    src: `
佐藤|AとBはもう見積もりが来てます
鈴木|いくら？
佐藤|Aが30万円で2週間、Bが45万円で1週間
鈴木|Bは高いけど早いな
佐藤|Cは見積もりが明日来る予定です
鈴木|じゃあ明日それを見てから判断しよう
`,
  }),
  mk({
    id: "wait-criteria-not-yet",
    category: "wait",
    scenario: "候補はあるが比較の軸が決まっていない",
    agenda: "移転先オフィスの検討",
    label: "WAIT",
    src: `
総務|候補の物件が4つあります
部長|多いな
総務|駅近のところ、広いところ、安いところ、新築のところ
部長|何で比べればいいんだろう
総務|基準を決めないとですね
部長|まず会議で何を重視するか決めよう
`,
  }),
];

// ───────── SILENCE：図表を出してはいけない会話 ─────────
const SILENCE_SNIPPETS: CanvasSnippet[] = [
  mk({
    id: "sil-chitchat",
    category: "silence",
    scenario: "雑談",
    agenda: "週次定例",
    label: "SILENCE",
    src: `
田中|週末どうでした？
佐藤|子どもの運動会でした、暑かった
田中|もう秋なのにね
鈴木|うちも先週行きましたよ
佐藤|お弁当作るの大変で
田中|分かる、早起きしんどい
鈴木|そろそろ始めましょうか
田中|そうですね
`,
  }),
  mk({
    id: "sil-status",
    category: "silence",
    scenario: "進捗の口頭報告（人ごとの状況）",
    agenda: "週次定例の進捗報告",
    label: "SILENCE",
    src: `
田中|じゃあ進捗、佐藤さんから
佐藤|ログイン画面の修正は完了しました、レビュー待ちです
田中|了解
鈴木|私は検索の改善、いま7割くらいです
田中|来週には終わりそう？
鈴木|はい、大丈夫だと思います
高橋|私はドキュメント更新して、特にブロッカーなしです
田中|OK、ありがとう
`,
    note: "担当×状況の表にもなりうるが、口頭の報告は表にしないのが自然、というラベル",
  }),
  mk({
    id: "sil-yesno",
    category: "silence",
    scenario: "はい／いいえの確認だけ",
    agenda: "デザイン確認",
    label: "SILENCE",
    src: `
デザイナー|このボタン、青でよかったですか
部長|うん、青でOK
デザイナー|了解です
部長|ありがとう
`,
  }),
  mk({
    id: "sil-numbers",
    category: "silence",
    scenario: "数字の報告（構造なし）",
    agenda: "月次売上報告",
    label: "SILENCE",
    src: `
経理|今月の売上は1億2千万円でした
部長|先月比は？
経理|プラス5%です
部長|利益は？
経理|営業利益で1,800万円
部長|了解、悪くないね
経理|はい
`,
  }),
  mk({
    id: "sil-shared-context",
    category: "silence",
    scenario: "2人にしか通じない略語の会話",
    agenda: "（定例の合間の雑談）",
    label: "SILENCE",
    src: `
Aさん|例のやつ、あれ直した？
Bさん|うん、昨日のうちに
Aさん|じゃあ先方にはいつもの感じで
Bさん|了解、あとで送っとく
Aさん|頼む
`,
  }),
  mk({
    id: "sil-brainstorm",
    category: "silence",
    scenario: "構造のないアイデア出し",
    agenda: "新サービスの名前のアイデア出し",
    label: "SILENCE",
    src: `
司会|新サービスの名前、思いつくままいきましょう
田中|ひだまり、とか
佐藤|もっと短いほうがよくない？ ポン、とか
鈴木|あはは、猫っぽい
田中|じゃあミライ
高橋|カタカナにしてミライズ
佐藤|なんか既にありそう
鈴木|とりあえずメモしておきましょう
司会|はい、どんどん出してください
`,
  }),
  mk({
    id: "sil-heated",
    category: "silence",
    scenario: "感情的な言い合い（議題の内側）",
    agenda: "納期遅延への対応",
    label: "SILENCE",
    src: `
営業|納期遅れるって、なんで先に言ってくれなかったんですか
開発|言ってましたよ、先週のミーティングで
営業|聞いてないです、お客様に何て説明すれば
開発|それはこっちも想定外で
営業|想定外で済まされないですよ
課長|まあまあ、落ち着いて
開発|すみません、でも人手が足りなくて
営業|それは分かりますけど…
課長|とりあえずお客様への連絡は私がします
`,
  }),
  mk({
    id: "sil-qa",
    category: "silence",
    scenario: "質疑応答（1問ずつ）",
    agenda: "新入社員向け制度説明",
    label: "SILENCE",
    src: `
講師|ここまで、何か質問ありますか
新人|有給って、入社してすぐ取れますか
人事|半年後からですが、特別休暇ならすぐ使えます
新人|特別休暇ってどんなものですか
人事|結婚とか忌引きとかですね
新人|分かりました、ありがとうございます
`,
  }),
  mk({
    id: "sil-todos",
    category: "silence",
    scenario: "無関係なTODOの列挙",
    agenda: "今週のタスク共有",
    label: "SILENCE",
    src: `
田中|今週のTODO共有しますね、まずコピー機のトナー発注
佐藤|あ、私は来客用のお茶を買っておきます
鈴木|社内報の原稿、金曜までに出します
田中|それと、経費精算の締め、木曜です
高橋|私は特にないです
田中|OK、各自お願いします
`,
  }),
  mk({
    id: "sil-decided",
    category: "silence",
    scenario: "全員が理解している決定の確認",
    agenda: "来月のイベント会場",
    label: "SILENCE",
    src: `
部長|じゃあ、来月のイベントはA会場で決まりね
田中|はい
佐藤|了解です
鈴木|予約しておきます
部長|よろしく
`,
  }),
  mk({
    id: "sil-boss-monologue",
    category: "silence",
    scenario: "上司の長い一人語り（議題に関連、構造なし）",
    agenda: "今期の方針共有",
    label: "SILENCE",
    src: `
部長|えー、今期の方針について少し話すとね、やっぱり一番大事なのはお客様との信頼関係だと思うんですよ。私が若い頃は、毎週お客様のところに足を運んでね、顔を覚えてもらうところから始めたもんです。だからみんなにも、メールだけじゃなくて直接会う機会を大事にしてほしい。数字も大事だけど、結局は人と人ですから
課長|おっしゃる通りです
新人|勉強になります
部長|うん
課長|現場にも共有しておきます
部長|頼むよ
`,
  }),
  mk({
    id: "sil-schedule-tidbit",
    category: "silence",
    scenario: "日程調整（候補は1つだけ）",
    agenda: "次回の打ち合わせ",
    label: "SILENCE",
    src: `
田中|次の打ち合わせ、来週火曜の14時でどうですか
佐藤|大丈夫です
鈴木|私もOKです
田中|じゃあそれで
`,
  }),
];

// ───────── 重複表示：すでに図表が出ている ─────────
const FLOW_ACTIVE = "経費精算の承認フロー（本人申請→上長承認→3万円超は部長承認→経理チェック→月末振込、不備は本人へ差し戻し）";
const TABLE_ACTIVE = "監視ツール比較表（A/B/Cの月額・導入期間・サポート）";
const RELEASE_ACTIVE = "リリース手順（PRレビュー→CI→本番デプロイ）";

const DEDUP_SNIPPETS: CanvasSnippet[] = [
  mk({
    id: "dedup-flow-same",
    category: "dedup",
    scenario: "同じ内容を会話で繰り返しているだけ（フロー）",
    agenda: "経費精算の承認ルールの整理",
    label: "SILENCE",
    hasActiveDiagram: true,
    activeSummary: FLOW_ACTIVE,
    src: `
田中|さっきの図のとおり、申請したら上長ですよね
鈴木|はい、3万円超なら部長も
高橋|図を見ると、経理のチェックが入ってから振込なんですね
鈴木|そうです、月末に
田中|じゃあこの流れで周知しましょう
`,
  }),
  mk({
    id: "dedup-table-same",
    category: "dedup",
    scenario: "同じ内容を会話で繰り返しているだけ（表）",
    agenda: "監視ツールの選定",
    label: "SILENCE",
    hasActiveDiagram: true,
    activeSummary: TABLE_ACTIVE,
    src: `
部長|表を見ると、Aは月5万円で2週間か
佐藤|はい、サポートは平日のみです
鈴木|Bは高いけど24時間なのがいいな
部長|Cは遅いからなしかな
佐藤|ですね
`,
  }),
  mk({
    id: "dedup-flow-changed",
    category: "dedup",
    scenario: "表示中の図の内容が会話で大きく変わった",
    agenda: "リリース手順の更新",
    label: "FLOW",
    hasActiveDiagram: true,
    activeSummary: RELEASE_ACTIVE,
    src: `
山本|さっきの図、実は先月から変わってて
中村|あ、そうなんですか
山本|CIのあとにステージングでQAが受け入れテストをして
小林|QAが承認したら本番デプロイ、っていう流れになりました
中村|じゃあ図は、PRレビュー、CI、ステージング、QA承認、本番、になりますね
山本|はい、それです
`,
    gold: {
      flow: {
        nodes: [
          { id: "n1", label: "PRレビュー" },
          { id: "n2", label: "CI" },
          { id: "n3", label: "ステージングで受入テスト" },
          { id: "n4", label: "QA承認" },
          { id: "n5", label: "本番デプロイ" },
        ],
        edges: [
          { from: "n1", to: "n2" },
          { from: "n2", to: "n3" },
          { from: "n3", to: "n4" },
          { from: "n4", to: "n5" },
        ],
      },
    },
    note: "表示中の図と手順が実質的に違う。出し直しが妥当（判断が割れる場合は ambiguous に移すこと）",
  }),
  mk({
    id: "dedup-minor-edit",
    category: "dedup",
    scenario: "表示中の図の軽微な訂正（名称だけ）",
    agenda: "経費精算の承認ルールの整理",
    label: "SILENCE",
    hasActiveDiagram: true,
    activeSummary: FLOW_ACTIVE,
    src: `
鈴木|承認の名前、図では部長ってなってるけど
田中|あ、本部長ですね、うちは
鈴木|修正しといてもらえます？
高橋|はい、あとで直します
`,
    note: "名称の訂正だけなので、図の作り直しは不要",
  }),
];

// ───────── ambiguous：人でも判断が割れる ─────────
const AMBIGUOUS_SNIPPETS: CanvasSnippet[] = [
  mk({
    id: "amb-flow-or-table",
    category: "ambiguous",
    scenario: "手順と違いが混ざる（フローにも表にもなる）",
    agenda: "新プランの申込手順と違いの説明",
    label: "ambiguous",
    humanAgreement: "split",
    acceptable: ["FLOW", "TABLE", "WAIT"],
    src: `
営業|新プランの申込は、フォームを送って、審査があって、開通です
新人|プランごとの違いも聞いていいですか
営業|ライトは月3千円で5人まで、スタンダードは1万円で20人まで
新人|申込の流れはどのプランも同じですか
営業|同じです、ただプレミアムは審査が少し長いです
課長|流れと違い、両方まとめて説明資料にしよう
`,
  }),
  mk({
    id: "amb-two-options",
    category: "ambiguous",
    scenario: "2つの選択肢の一長一短（論点が混ざる）",
    agenda: "働き方の方針",
    label: "ambiguous",
    humanAgreement: "split",
    acceptable: ["TABLE", "WAIT", "SILENCE"],
    src: `
部長|週3リモートにするか、完全出社に戻すか
課長|リモートだと採用はしやすいです
人事|出社のほうがコミュニケーションは取りやすい
課長|コストはオフィス代がかかる
部長|両方一長一短だな
人事|論点が混ざってますね、整理したほうがいいかも
`,
  }),
  mk({
    id: "amb-recap",
    category: "ambiguous",
    scenario: "会議終盤の決定事項の確認（列挙）",
    agenda: "本日のまとめ",
    label: "ambiguous",
    humanAgreement: "split",
    acceptable: ["SILENCE", "WAIT", "TABLE"],
    src: `
司会|最後に決まったことを確認します
司会|1つ目、リリースは来月15日
司会|2つ目、担当は佐藤さん
司会|3つ目、次回は来週木曜
田中|はい
佐藤|了解です
`,
  }),
];

export const QUIET_SNIPPETS: CanvasSnippet[] = [
  ...WAIT_SNIPPETS,
  ...SILENCE_SNIPPETS,
  ...DEDUP_SNIPPETS,
  ...AMBIGUOUS_SNIPPETS,
];
