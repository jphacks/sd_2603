// Small, synthetic decision snapshots. Labels describe whether a nudge is useful now,
// not whether a topic is merely different from the agenda.
export const cases = [
  {
    id: 'on-track-release', category: 'on_track', expected: 'no_intervention',
    agenda: '次のリリース日と担当を決める',
    transcript: [
      'A: 候補は25日と27日です。',
      'B: 25日はテスト完了から一日しかなく、確認が厳しそうです。',
      'A: では27日にしましょう。最終確認は誰が担当しますか。',
      'C: 私が26日までに確認して、問題があれば連絡します。',
    ],
  },
  {
    id: 'on-track-incident', category: 'on_track', expected: 'no_intervention',
    agenda: '先週の障害の再発防止策を決める',
    transcript: [
      'A: DBの接続数が上限に達したのが原因でした。',
      'B: バッチの実行時刻をずらす案があります。',
      'C: 接続プールも見直して、八割でアラートを出しましょう。',
      'A: ではバッチは私、アラートはCさんが今日中に対応します。',
    ],
  },
  {
    id: 'useful-wifi-check', category: 'productive_tangent', expected: 'no_intervention',
    agenda: '社内ハッカソンの日程と会場を決める',
    transcript: [
      'A: 会場は10階の会議室を三部屋確保できそうです。',
      'B: その階は前回Wi-Fiが何度か切れました。会場決定前に確認したいです。',
      'C: ハッカソンではネットが必要なので、有線LANも候補にしましょう。',
      'A: 情シスへ今日確認して、使えるなら10階で確定します。',
    ],
  },
  {
    id: 'useful-budget-history', category: 'productive_tangent', expected: 'no_intervention',
    agenda: '来期のマーケティング予算配分を決める',
    transcript: [
      'A: 動画に500万円、イベントに200万円という案です。',
      'B: その前に昨年のイベントが商談につながった割合を確認したいです。',
      'C: 参加は多かったのに商談は少なかった記憶があります。数字を見ます。',
      'A: では実績を確認してから、動画とイベントの配分を決めましょう。',
    ],
  },
  {
    id: 'drift-just-started', category: 'brief_drift', expected: 'no_intervention',
    agenda: '次のリリース日と担当を決める',
    transcript: [
      'A: リリース日は25日か27日かを決めたいです。',
      'B: 25日はテストが間に合わないので27日がよさそうです。',
      'A: 担当も決めましょう。',
      'C: そういえば週末、ゴルフに行ったんですよ。',
    ],
  },
  {
    id: 'sustained-golf-drift', category: 'sustained_drift', expected: 'intervene',
    agenda: '次のリリース日と担当を決める',
    transcript: [
      'A: リリース日と最終確認の担当がまだ決まっていません。',
      'B: 27日ならテスト後に余裕がありますね。',
      'C: 週末ゴルフに行って、新しいコースがよかったんです。',
      'A: どこのコースですか。',
      'C: 山のほうです。グリーンが難しくて。',
      'B: 私も行きたいです。料金はどのくらいですか。',
      'C: 一万円くらいでした。次は皆で行きたいですね。',
    ],
  },
  {
    id: 'sustained-vacation-drift', category: 'sustained_drift', expected: 'intervene',
    agenda: '採用面接の回数と担当を決める',
    transcript: [
      'A: 面接を四回から三回にする案の担当が未決です。',
      'B: 技術面接を統合するなら面接官を二人決めないと。',
      'C: 来月の休暇、どこへ行く予定ですか。',
      'A: 海外へ行きます。ホテルを探していて。',
      'B: 私は去年そこへ行きました。食事がよかったですよ。',
      'C: 航空券は高かったですか。',
      'A: 早めに取ったので安かったです。観光地もおすすめです。',
    ],
  },
  {
    id: 'stalled-release-date', category: 'stalled', expected: 'intervene',
    agenda: '次のリリース日を決める',
    transcript: [
      'A: 25日に出したいです。早く届けられます。',
      'B: 27日にしたいです。テストに余裕が必要です。',
      'A: 早く出すことが大事なので25日です。',
      'B: 品質が大事なので27日です。',
      'A: でも早く届けたいんです。',
      'B: でもテストの余裕が要るんです。',
      'C: 新しい情報も代案も出ていないので、決め方を整理したいですね。',
    ],
  },
  {
    id: 'stalled-budget-choice', category: 'stalled', expected: 'intervene',
    agenda: '広告とイベントの予算配分を決める',
    transcript: [
      'A: 広告を増やせば新規獲得が増えると思います。',
      'B: イベントを増やしたいです。既存顧客との関係が大切です。',
      'A: 新規獲得が必要なので広告を増やすべきです。',
      'B: 関係維持が必要なのでイベントを増やすべきです。',
      'A: やはり広告を優先したいです。',
      'B: 私はイベントを優先したいです。',
      'C: 同じ二つの主張を繰り返していて、配分も判断基準も決まっていません。',
    ],
  },
  {
    id: 'finished-then-chat', category: 'ambiguous', expected: null,
    agenda: '次のリリース日と担当を決める',
    transcript: [
      'A: リリースは27日、最終確認はCさんで決定ですね。',
      'C: はい、26日までに終えます。',
      'B: 皆さん、お疲れさまでした。',
      'A: リリース後に打ち上げもしたいですね。',
      'B: 駅前のお店はどうでしょう。',
    ],
  },
];

// Kept separate so a later rule change can be checked on unseen scenarios.
export const holdout = [
  {
    id: 'holdout-useful-risk', category: 'productive_tangent', expected: 'no_intervention',
    agenda: '共有リンクの有効期限と表示を決める',
    transcript: [
      'A: 有効期限は七日でどうでしょう。',
      'B: 期限切れ時の表示も決めたいです。以前はエラー表示が分かりづらく問い合わせが増えました。',
      'C: 期限切れと明示して、再発行の案内を付けましょう。',
      'A: その表示で進めます。',
    ],
  },
  {
    id: 'holdout-stalled-priority', category: 'stalled', expected: 'intervene',
    agenda: '次のスプリントの優先順位を決める',
    transcript: [
      'A: 通知を先にしたいです。要望が多いので。',
      'B: 検索フィルタを先にしたいです。実装が軽いので。',
      'A: 要望の多さから通知が先です。',
      'B: 実装の軽さからフィルタが先です。',
      'A: でもユーザーは通知を待っています。',
      'B: でもフィルタなら早く出せます。',
    ],
  },
];
