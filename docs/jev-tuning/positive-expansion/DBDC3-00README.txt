Overview:
---------
This dataset was made by DBDC3 Task Organizers. The data can be used
for both profit and nonprofit purposes under the MIT license (see
LICENSE.txt).  The data contain both English and Japanese dialogues
with dialogue breakdown annotations for each system utterance. For
more details of the dataset, refer to [1].

* English data:

The following four datasets were used as development data in DBDC3.

- CIC_115: 115 dialogues collected in the human evaluation round of
  the Conversational Intelligence Challenge (CIC; http://convai.io/).
  We randomly selected a subset of dialogues and used the initial part
  of the dialogues for annotation.
- IRIS_100: 100 dialogues selected from the WOCHAT dataset.
  (http://workshop.colips.org/wochat/data/index.html)
- TKTK_100: 100 dialogues selected from the WOCHAT dataset.
- YI_100: 100 dialogues collected by using a chatbot
  developed at the Moscow Institute of Physics and Technology.

The following four datasets were used as evaluation data in DBDC3.

- CIC_50: 50 dialogues collected by CIC.
- IRIS_50: 50 dialogues provided by the developer of IRIS.
- TKTK_50: 50 dialogues we (the organizers) collected by using TickTock.
- YI_50: 50 dialogues we collected in the same way as YI_100.

Each dialogue in CIC_115 and CIC_50 was collected by showing a context
represented by a short paragraph to a user before the dialogue.  The
context files for the dialogues are distributed at the following URL:
https://dbd-challenge.github.io/dbdc3/data/DBDC3_context.zip

* Japanese data:

The following three datasets were used as evaluation data in DBDC3.

- DCM: 50 dialogues we collected by using NTT DOCOMO's chat API.
- DIT: 50 dialogues we collected by using DIT (Denso IT Laboratory's system).
- IRS: 50 dialogues we collected by using IRS (IR-status based system).

You can also refer to https://dbd-challenge.github.io/dbdc3/datasets
for additional datasets in Japanese used in DBDC1 and DBDC2.

* Revision after DBDC3

There are two folders, "dbdc3" and "dbdc3_revised", in the data
folder.  "dbdc3" is the one used for the DBDC3 workshop and
"dbdc3_revised" is the one we revised after the workshop.

The four datasets, CIC_115, YI_100 in dbdc3/en/dev/ and CIC_50, YI_50
in dbdc3/en/test/ were re-annotated and are stored under dbdc3_revised
folder.  In the original data, each annotator was allowed to annotate
a part of a dialogue; however, in the revised data, each annotator was
obliged to annotate all utterances of a dialogue in a row. This
revision slightly increased the inter-annotator agreement.

Folder Structure:
-----------------
data
├── dbdc3
│   ├── en
│   │   ├── dev
│   │   │   ├── CIC_115
│   │   │   ├── IRIS_100
│   │   │   ├── TKTK_100
│   │   │   └── YI_100
│   │   └── eval
│   │       ├── CIC_50
│   │       ├── IRIS_50
│   │       ├── TKTK_50
│   │       └── YI_50
│   └── jp
│       └── eval
│           ├── DCM
│           ├── DIT
│           └── IRS
└── dbdc3_revised
    ├── en
    │   ├── dev
    │   │   ├── CIC_115 *revised*
    │   │   ├── IRIS_100
    │   │   ├── TKTK_100
    │   │   └── YI_100  *revised*
    │   └── eval
    │       ├── CIC_50  *revised*
    │       ├── IRIS_50
    │       ├── TKTK_50
    │       └── YI_50   *revised*
    └── jp
        └── eval
            ├── DCM
            ├── DIT
            └── IRS

Reference:
----------
Please refer to one or both of the following papers when you publish
your results using this dataset.

[1] R. Higashinaka, K. Funakoshi, M. Inaba, Y. Tsunomori, T. Takahashi,
  and N. Kaji, "Overview of dialogue breakdown detection challenge 3,"
  in Proceedings of Dialog System Technology Challenge 6 (DSTC6)
  Workshop, 2017.

[2] R. Higashinaka, K. Funakoshi, Y. Kobayashi, and M. Inaba, "The
  dialogue breakdown detection challenge: Task description, datasets,
  and evaluation metrics," in Proceedings of The Tenth International
  Conference on Language Resources and Evaluation (LREC), 2016.

Sponsors:
---------
We thank the following sponsors to help us create the dataset.

- Nextremer Co., Ltd.
- DENSO IT LABORATORY, INC.
- Honda Research Institute Japan Co., Ltd.
- NTT DOCOMO, INC.

Acknowledgments:
----------------
We would like to thank Rafael E. Banchs, Zhou Yu, Valentin Malykh,
Idris Yusupov, and Yury Kuratov for graciously providing us with
datasets and chatbots to make DBDC3 possible. We also thank the
Japanese Society for Artificial Intelligence (JSAI) for supporting the
event.

Task Organizers:
----------------
- Ryuichiro Higashinaka (NTT)
- Kotaro Funakoshi (Kyoto University/Honda Research Institute Japan)
- Michimasa Inaba (Hiroshima City University)
- Yuiko Tsunomori (NTT Docomo)
- Tetsuro Takahashi (Fujitsu)
- Nobuhiro Kaji (Yahoo Japan Corporation)

Contact:
--------
dbdc3-organizers@googlegroups.com

Revision history:
-----------------
- v1.2: Feb. 28 2018
- v1.1: Feb. 19 2018
- v1.0: Feb. 11 2018
