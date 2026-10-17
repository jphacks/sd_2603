import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Noto_Sans_JP } from "next/font/google";
import { CameraDemo } from "@/components/landing/CameraDemo";
import { MeetScene } from "@/components/landing/MeetScene";
import logo from "@/public/brand/aida-selected/aida-wordmark-v1.png";
import cameraOnTrack from "@/public/lp/camera-on-track.jpg";
import cameraOffTrack from "@/public/lp/camera-off-track.jpg";
import cameraSilence from "@/public/lp/camera-silence.jpg";
import meetingPortrait from "@/public/lp/meeting-portrait.jpg";
import styles from "./about.module.css";

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  weight: ["400", "500", "600"],
  preload: false,
});

export const metadata: Metadata = {
  title: "AIDA｜空気を読み、間に入る。",
  description:
    "AIDA（Ambient Intelligence, Discreet Assistance.）は、Google Meet の会議が脱線したり沈黙が続いたりしたときに介入し、議論を前へ進める AI ファシリテーターです。",
};

const behaviors = [
  {
    number: "01",
    title: "順調なら、見守る。",
    image: cameraOnTrack,
    alt: "AIDAのカメラ表示。順調の状態で、淡い緑の円が中央に浮かび、文章は表示されていない。",
    caption: "順調時の実装画面",
    body: "議題に沿って話が進んでいるあいだは、緑の円が静かに浮遊するだけです。中央に文章は出しません。",
    quote: null,
  },
  {
    number: "02",
    title: "脱線したら、議題へ戻す。",
    image: cameraOffTrack,
    alt: "AIDAのカメラ表示。脱線を検知した直後で、赤い円が強調され、右下に「変化を検知」と表示されている。",
    caption: "脱線を検知した直後の実装画面。この後に一言を表示",
    body: "議題の達成に役立たない話題へ移ったと判断したときに介入します。色と動きで変化を伝えてから、短い一言を表示します。",
    quote: ["議題に", "戻ってみませんか"],
  },
  {
    number: "03",
    title: "沈黙が続いたら、問いかける。",
    image: cameraSilence,
    alt: "AIDAのカメラ表示。沈黙を検知した直後で、青い円が強調され、右下に「変化を検知」と表示されている。",
    caption: "沈黙を検知した直後の実装画面。この後に一言を表示",
    body: "新しい意見が出ず、議論が止まっていると判断したときに介入します。同じ流れで、次の発言を促す問いを表示します。",
    quote: ["気になることは", "ありますか？"],
  },
];

const conditions = [
  {
    title: "議題に役立つ寄り道は止めない",
    body: "本筋から外れていても、議題に必要な事実・リスク・前例を確かめている話題は、脱線として扱いません。",
  },
  {
    title: "判断がつかないあいだは待つ",
    body: "脱線や停滞の兆しがあっても確信が持てないときは、表示を変えずに会話の続きを見ます。",
  },
  {
    title: "続けて口を挟まない",
    body: "一度介入したら、次の介入まで60秒以上あけます。発言が3件に満たないうちは判断しません。",
  },
];

const steps = [
  {
    number: "STEP 01",
    title: "会議へ招待",
    body: "Google Meet の会議URLを自動で取得し、AIDAが会議に入室します。Meet側で参加リクエストを許可してください。",
    note: null,
  },
  {
    number: "STEP 02",
    title: "議題を共有する",
    body: "Google Meet のチャット欄に、アジェンダをテキストで入力します。AIDAはその内容を、今日の会議で決めることとして読み取ります。",
    note: null,
  },
  {
    number: "STEP 03",
    title: "必要なときに介入",
    body: "議題と直近の発言をもとに、見守るか介入するかを判断します。介入するときだけ、AIDAのカメラ表示が変わります。",
    note: null,
  },
];

export default function AboutPage() {
  return (
    <div className={`${styles.page} ${notoSansJp.variable}`}>
      <a className={styles.skipLink} href="#main">
        本文へ移動
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.headerLogo} href="#top" aria-label="AIDA ページの先頭へ">
            <span className={styles.logoCrop}>
              <Image src={logo} alt="" sizes="200px" loading="eager" />
            </span>
          </a>
          <nav className={styles.nav} aria-label="ページ内">
            <a href="#behavior">振る舞い</a>
            <a href="#how">使い方</a>
            <a href="#demo">デモ</a>
          </nav>
          <Link className={styles.headerCta} href="/">
            参加画面へ
          </Link>
        </div>
      </header>

      <main id="main" tabIndex={-1} className={styles.main}>
        <section id="top" className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroText}>
            <div className={styles.heroLogo}>
              <Image
                src={logo}
                alt="AIDA Ambient Intelligence, Discreet Assistance."
                sizes="(max-width: 960px) 80vw, 400px"
                preload
              />
            </div>
            <h1 id="hero-title" className={styles.heroTitle}>
              <span>空気を読み、</span>
              <span>間に入る。</span>
            </h1>
            <p className={styles.heroLead}>
              会議の流れを捉え、脱線や沈黙が続く場面で介入する。必要なひとことで、議論を前へ進める AI ファシリテーターです。
            </p>
            <div className={styles.ctaRow}>
              <a className={styles.primaryCta} href="#demo">
                デモを見る
              </a>
              <Link className={styles.secondaryCta} href="/">
                会議に参加させる
              </Link>
            </div>
          </div>

          <figure className={styles.heroVisual}>
            <div className={styles.display}>
              <Image
                src={cameraOnTrack}
                alt="AIDAのカメラ表示。順調の状態で、淡い緑の円が中央に浮かび、左下にFocus、右下に見守り中と表示されている。"
                sizes="(max-width: 960px) 92vw, 680px"
                loading="eager"
              />
            </div>
            <div className={styles.stand} aria-hidden="true" />
            <figcaption className={styles.figcaption}>
              現在のカメラ実装を撮影した画面（順調）。端末の枠は表示イメージです。
            </figcaption>
          </figure>
        </section>

        <section className={styles.section} aria-labelledby="problem-title">
          <div className={styles.problem}>
            <figure className={styles.portrait}>
              <Image
                src={meetingPortrait}
                alt="ノートパソコンの前で、頬杖をついて会議の話に耳を傾ける人。"
                sizes="(max-width: 960px) 92vw, 480px"
              />
            </figure>
            <div>
              <p className={styles.eyebrow}>課題</p>
              <h2 id="problem-title" className={styles.h2}>
                話を戻すひとことは、
                <br />
                言い出しにくい。
              </h2>
              <ul className={styles.problemList}>
                <li>
                  <h3>話がそれても、戻しづらい</h3>
                  <p>
                    脱線に気づいても、発言を遮って議題へ戻すのは負担が大きく、進行役ひとりに任されがちです。
                  </p>
                </li>
                <li>
                  <h3>沈黙が続き、議論が進まない</h3>
                  <p>
                    意見が出ない、あるいは同じ論点を繰り返したまま、次に決めることへ進めない時間が生まれます。
                  </p>
                </li>
              </ul>
              <p className={styles.problemAnswer}>
                AIDAは会議に参加する第三者として、その一言を引き受けます。特定の参加者に進行の負担を寄せず、全員が議論に集中できるようにします。
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="meet-title">
          <div className={styles.meet}>
            <div className={styles.meetText}>
              <p className={styles.eyebrow}>Google Meet の中で</p>
              <h2 id="meet-title" className={styles.h2}>
                参加者のひとりとして、
                <br />
                会議に入る。
              </h2>
              <p className={styles.sectionLead}>
                AIDAは Google Meet に参加者として入室し、自分のカメラ表示で会議の状態を伝えます。画面を切り替えたり、別のツールを開いたりする必要はありません。
              </p>
            </div>
            <figure className={styles.meetFigure}>
              <MeetScene />
              <figcaption className={styles.figcaption}>Google Meet での表示イメージ</figcaption>
            </figure>
          </div>
        </section>

        <section id="behavior" className={styles.section} aria-labelledby="behavior-title">
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>振る舞い</p>
            <h2 id="behavior-title" className={styles.h2}>
              会議の状態に応じた、3つの振る舞い。
            </h2>
            <p className={styles.sectionLead}>
              AIDAは議題と直近の発言をもとに、見守るか、介入するかを判断します。
            </p>
          </div>

          <ol className={styles.behaviors}>
            {behaviors.map((item) => (
              <li key={item.number} className={styles.behavior}>
                <h3 className={styles.behaviorTitle}>
                  <span className={styles.number}>{item.number}</span>
                  {item.title}
                </h3>
                <figure className={styles.shot}>
                  <Image src={item.image} alt={item.alt} sizes="(max-width: 960px) 92vw, 380px" />
                  <figcaption className={styles.figcaption}>{item.caption}</figcaption>
                </figure>
                <p className={styles.behaviorBody}>{item.body}</p>
                <p className={styles.quote}>
                  <span className={styles.quoteLabel}>表示する文言</span>
                  {item.quote ? (
                    <span>「{item.quote[0]} {item.quote[1]}」</span>
                  ) : (
                    <span>なし</span>
                  )}
                </p>
              </li>
            ))}
          </ol>

          <div className={styles.conditions}>
            <h3 className={styles.h3}>介入する前に確かめていること</h3>
            <ul className={styles.conditionList}>
              {conditions.map((item) => (
                <li key={item.title}>
                  <h4>{item.title}</h4>
                  <p>{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how" className={styles.section} aria-labelledby="how-title">
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>使い方</p>
            <h2 id="how-title" className={styles.h2}>
              使い方は、会議の流れの中に。
            </h2>
          </div>
          <ol className={styles.steps}>
            {steps.map((step) => (
              <li key={step.number} className={styles.step}>
                <span className={styles.stepNumber}>{step.number}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepBody}>{step.body}</p>
                {step.note ? <p className={styles.stepNote}>{step.note}</p> : null}
              </li>
            ))}
          </ol>
        </section>

        <section id="demo" className={styles.section} aria-labelledby="demo-title">
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>デモ</p>
            <h2 id="demo-title" className={styles.h2}>
              カメラ表示を、ここで試す。
            </h2>
            <p className={styles.sectionLead}>
              状態を選ぶと、AIDAのカメラ表示の動きを再生します。
            </p>
          </div>
          <CameraDemo />
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <div>
            <h2 id="closing-title" className={styles.closingTitle}>
              実際の会議で試す
            </h2>
            <p className={styles.closingBody}>
              AIDAを会議に参加させて、実際の議論の中で見守る・介入するの振る舞いを確かめられます。
            </p>
          </div>
          <Link className={styles.primaryCta} href="/">
            会議に参加させる
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p className={styles.footerBrand}>AIDA — Ambient Intelligence, Discreet Assistance.</p>
          <nav className={styles.footerNav} aria-label="フッター">
            <a href="#behavior">振る舞い</a>
            <a href="#how">使い方</a>
            <a href="#demo">デモ</a>
            <Link href="/">参加画面</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
