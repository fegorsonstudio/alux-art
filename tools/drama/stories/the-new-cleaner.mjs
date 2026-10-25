// The New Cleaner — written by the screenwriter (tools/drama/screenwriter.mjs, deepseek-flash) on 2026-10-25
// from the brief: The New Cleaner: the cleaner the staff humiliate on her first day at a Calabar hotel is the hotel's new owner. Feeling: being judged by how you look. Opens on a manager kicking her bucket aside in front of guests. A hotel in Calabar, carnival season approaching, rain on the Marina.
// Check with `node tools/drama/check.mjs the-new-cleaner`, read it like an editor, then seed with scripts/drama-seed.mjs.
export default {
  "slug": "the-new-cleaner",
  "title": "The New Cleaner",
  "tagline": "They judged the uniform. She owned the hotel.",
  "genre": "power",
  "city": "Calabar",
  "logline": "Ekaette checks into her late father's Calabar hotel as a cleaner to see it from inside. The manager humiliating her plans to sell it before carnival opens. Ekaette owns it.",
  "minVotes": 2,
  "cast": [
    {
      "key": "ekaette",
      "name": "Ekaette Edet",
      "age": 34,
      "role": "New cleaner and majority owner",
      "archetype": "The Hustler",
      "side": "light",
      "tier": "lead",
      "open": true,
      "look": "Tall, slim, close-cropped natural hair under a grey housekeeping cap, clear brown skin, plain grey cleaner's uniform with a name tag, a brass master key on a red ribbon at her wrist.",
      "want": "To see her late father's hotel from the inside before she claims it.",
      "secret": "Her father left her 51% of the Marina Crest; the original share certificate is in the hotel strongroom."
    },
    {
      "key": "nkoyo",
      "name": "Nkoyo Bassey",
      "age": 46,
      "role": "General Manager",
      "archetype": "The Oga",
      "side": "too much",
      "tier": "main",
      "open": true,
      "look": "Sharp black bob, bold lipstick, black tailored suit, gold name brooch, heels that click, a leather clipboard always in one hand.",
      "want": "To close the sale to Crestline and take a regional directorship.",
      "secret": "She has cooked the occupancy ledger and holds a yellowed loan pledge over ten percent of the founder's shares."
    },
    {
      "key": "emem",
      "name": "Emem Effiong",
      "age": 27,
      "role": "Front-desk supervisor",
      "archetype": "The Companion",
      "side": "light",
      "tier": "main",
      "open": true,
      "look": "Braids in a high bun, navy blazer over a white shirt, staff lanyard, kind tired eyes, a phone never far from her hand.",
      "want": "To keep every member of her team employed.",
      "secret": "She copied the altered ledger and has been the manager's anonymous leak."
    },
    {
      "key": "asuquo",
      "name": "Chief Asuquo Etim",
      "age": 68,
      "role": "Board Chairman",
      "archetype": "The Guardian",
      "side": "too little",
      "tier": "main",
      "open": true,
      "look": "White agbada, coral beads, carved walking stick, reading glasses on a chain, a small cap of dark velvet.",
      "want": "A quiet sale, a clear pension and no scandal.",
      "secret": "He signed the sale resolution without reading it."
    },
    {
      "key": "akanimo",
      "name": "Akanimo Udo",
      "age": 42,
      "role": "Crestline acquisitions consultant",
      "archetype": "The Visionary",
      "side": "too much",
      "tier": "main",
      "open": true,
      "look": "Lean, grey linen suit, rimless glasses, black umbrella, leather folder under one arm.",
      "want": "To close the deal and redevelop the Marina frontage.",
      "secret": "He was the founder's protégé and knows the hotel was pledged against a private loan."
    },
    {
      "key": "okon",
      "name": "Papa Okon",
      "age": 61,
      "role": "Doorman",
      "archetype": "The Innocent",
      "side": "light",
      "tier": "cameo",
      "open": true,
      "look": "Burgundy doorman's coat with gold braid, white gloves, peaked cap, old brass key on a chain, a back that is still straight.",
      "want": "To retire with his pension and his dignity.",
      "secret": "He kept the founder's brass master key and remembers Ekaette as a girl."
    }
  ],
  "episodes": [
    {
      "n": 1,
      "title": "The Bucket",
      "slides": [
        {
          "kind": "cover",
          "see": "The Marina Crest lobby in high-contrast black and white, one red carnival pennant dripping rain at the glass doors. A cleaner on her knees, a manager's red heel beside an overturned bucket, guests in the background stepping away. Caption space: top third, dark ceiling.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Exterior of the old Marina Crest Hotel at seven in the morning, rain on the glass, carnival banners half-hung and wet, one lit window above the entrance, the Calabar Marina grey behind.",
          "say": "Calabar. 7 a.m. Rain on the Marina. Carnival week begins.",
          "scene": "Rain on the Marina at dawn."
        },
        {
          "kind": "line",
          "who": "nkoyo",
          "see": "Lobby: Nkoyo stepping over the spill without looking down, clipboard against her chest, Ekaette kneeling with a mop, guests turning. The camera low, Ekaette's face half out of frame.",
          "say": "“In this hotel, uniforms clean. They do not speak.”",
          "scene": "The manager's heel, beside the bucket."
        },
        {
          "kind": "beat",
          "see": "Close on Ekaette's grey uniform and name tag, her hand wringing the mop, water spreading to a guest's polished shoe. Her jaw is tight; her eyes stay down.",
          "say": "The guest steps back. The cleaner wipes the shoe.",
          "scene": "A name tag. A mop. A wet floor."
        },
        {
          "kind": "text",
          "see": "Close on Nkoyo's leather clipboard, her thumb over the typed line: New owner Monday. Sign nothing until Crestline approves. The lobby lights reflect on the gold clip.",
          "say": "On the manager's clipboard: sign nothing until Monday.",
          "scene": "The clipboard, held tight."
        },
        {
          "kind": "beat",
          "see": "Nkoyo holds out a brass key on a red ribbon, pointing one finger at the lift. Ekaette's hand closes round it. In the corridor behind, a framed founder's portrait catches the light.",
          "say": "The manager gives her the owner's penthouse key.",
          "scene": "A brass key. A red ribbon."
        },
        {
          "kind": "cliff",
          "see": "Penthouse desk: Ekaette presses the brass key into a locked drawer. It opens on a share certificate, her name typed clearly, and a faded photograph of her father. Her cleaner's cap sits on the desk.",
          "say": "The drawer opens. The hotel already belongs to her.",
          "scene": "Her name on the share certificate."
        },
        {
          "kind": "choice",
          "see": "Close on the share certificate and the grey cleaner's cap on the dark desk, the brass key between them, rain running down the penthouse glass.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "reveal"
      },
      "choice": {
        "question": "Does Ekaette reveal herself today?",
        "options": [
          {
            "word": "SPEAK",
            "label": "Speak now"
          },
          {
            "word": "ENDURE",
            "label": "Stay hidden"
          }
        ]
      },
      "branches": {
        "SPEAK": "She walks down in her uniform and tells the lobby she owns the hotel. The manager laughs, then the board's lawyer arrives.",
        "ENDURE": "She buttons the uniform and goes back to mopping. The manager schedules the sale signing for carnival morning."
      },
      "slots": [
        {
          "key": "key",
          "object": "the brass master key on its red ribbon",
          "slide": 6,
          "house": "Luma lux"
        },
        {
          "key": "clipboard",
          "object": "the manager's clipboard",
          "slide": 5,
          "house": "Noir Director Editorial"
        }
      ],
      "alux": {
        "product": "Noir Director Editorial",
        "where": "the framed founder's portrait in the corridor as the key is handed over, slide 6"
      }
    }
  ],
  "drafts": [
    {
      "n": 2,
      "after": "SPEAK",
      "title": "The Laughing Lobby",
      "slides": [
        {
          "kind": "cover",
          "see": "The Marina Crest lobby at eight in the morning: Ekaette standing in her grey cleaner's uniform before Nkoyo and the guests, a lawyer's briefcase at the glass doors, carnival banners red against the black-and-white room.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Wide on the lobby, rain on the glass doors, the reception clock at eight, staff frozen with trays and files, Ekaette small in the centre.",
          "say": "8 a.m. The cleaner told the lobby she owns the hotel.",
          "scene": "The lobby, eight a.m."
        },
        {
          "kind": "line",
          "who": "nkoyo",
          "see": "Nkoyo laughing with her head back, clipboard held like a shield, guests smiling uneasily, Ekaette still and straight.",
          "say": "“A cleaner with a share certificate. In carnival week.”",
          "scene": "The manager laughs in the lobby."
        },
        {
          "kind": "beat",
          "see": "A board lawyer in a dark suit steps through the glass doors, briefcase in hand; Emem watches from the desk, phone lowered. A faded founder's portrait hangs beside the strongroom corridor.",
          "say": "The board's lawyer arrives. He asks for the certificate.",
          "scene": "A lawyer at the glass doors."
        },
        {
          "kind": "text",
          "see": "Close on the lawyer's phone, a secure note glowing, and beside it a faded framed portrait of the founder with a brass date plate too dark to read. Ekaette's phone lights the plate.",
          "say": "On his phone: the strongroom. Code: the founder's birthday.",
          "scene": "A phone. A safe code."
        },
        {
          "kind": "beat",
          "see": "Strongroom: the safe open, the certificate folder empty, the lawyer's hand flat on the steel table. Nkoyo appears in the doorway, not surprised.",
          "say": "The folder is empty. The manager is already at the door.",
          "scene": "The empty folder. Her at the door."
        },
        {
          "kind": "cliff",
          "who": "nkoyo",
          "see": "Nkoyo in the strongroom doorway holding a sealed envelope up, the founder's handwriting across it; Ekaette's brass key on the table between them, the lawyer out of focus.",
          "say": "The manager holds a sealed envelope: “Open before the board.”",
          "scene": "A sealed envelope, held up."
        },
        {
          "kind": "choice",
          "see": "Close on the sealed envelope on the strongroom table, the founder's handwriting and Nkoyo's thumb at the corner, Ekaette's brass key beside it.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "message"
      },
      "choice": {
        "question": "Does Ekaette open it here?",
        "options": [
          {
            "word": "OPEN",
            "label": "Open it now"
          },
          {
            "word": "SEAL",
            "label": "Wait for the board"
          }
        ]
      },
      "branches": {
        "OPEN": "She breaks the seal in the strongroom. Inside is her father's letter and a second key, not the one she holds.",
        "SEAL": "She keeps the envelope sealed and walks past the manager. By midnight it is gone from her room."
      },
      "slots": [
        {
          "key": "briefcase",
          "object": "the board lawyer's leather briefcase",
          "slide": 3,
          "house": "The Asset Extractor"
        },
        {
          "key": "safe",
          "object": "the strongroom safe",
          "slide": 6,
          "house": "Luma lux"
        }
      ],
      "alux": {
        "product": "The Gear Equalizer — Pro Studio Upgrade",
        "where": "the faded founder's portrait in the strongroom, relit on Ekaette's phone to read the brass plate, slide 4",
        "word": "LIGHT",
        "line": "The founder's birth date was lost in a dark portrait. Comment LIGHT and we'll relight yours."
      }
    },
    {
      "n": 2,
      "after": "ENDURE",
      "title": "The Long Shift",
      "slides": [
        {
          "kind": "cover",
          "see": "Housekeeping corridor at eight in the morning: Ekaette mopping close to the wall, Nkoyo and Akanimo in low conversation by the lift, two red carnival masks hanging from a trolley.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Wide on the housekeeping corridor, wet floor sign, strip light, Ekaette in grey, the manager and consultant small at the far lift.",
          "say": "8 a.m. The cleaner kept her uniform on.",
          "scene": "Housekeeping corridor. Eight a.m."
        },
        {
          "kind": "beat",
          "see": "Nkoyo talks softly to Akanimo, leather folder under his arm; Ekaette mops closer, head down, ear turned toward them.",
          "say": "The manager talks softly to the consultant. The cleaner mops closer.",
          "scene": "A mop, close to a whisper."
        },
        {
          "kind": "line",
          "who": "akanimo",
          "see": "Akanimo by the lift, rimless glasses catching the strip light, grey linen suit neat, his voice low and certain.",
          "say": "“After carnival, the Marina frontage is ours.”",
          "scene": "The consultant by the lift."
        },
        {
          "kind": "text",
          "see": "Linen closet: Emem holds her phone out to Ekaette. The screen shows a photograph of the old occupancy ledger, one column changed in fresh ink.",
          "say": "The front-desk supervisor shows her the changed ledger.",
          "scene": "A phone photo of the ledger."
        },
        {
          "kind": "beat",
          "see": "Strongroom: Ekaette turns the brass key, the safe open, certificate folder empty. In the corridor, Nkoyo's heels stop outside the door.",
          "say": "The safe is open. The certificate folder is empty.",
          "scene": "The safe. The folder empty."
        },
        {
          "kind": "cliff",
          "who": "nkoyo",
          "see": "Nkoyo in the strongroom doorway holding a sealed envelope up, the founder's handwriting across it; Ekaette's brass key on the table between them, the lawyer out of focus.",
          "say": "The manager holds a sealed envelope: “Open before the board.”",
          "scene": "A sealed envelope, held up."
        },
        {
          "kind": "choice",
          "see": "Close on the sealed envelope on the strongroom table, the founder's handwriting and Nkoyo's thumb at the corner, Ekaette's brass key beside it.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "message"
      },
      "choice": {
        "question": "Does Ekaette open it here?",
        "options": [
          {
            "word": "OPEN",
            "label": "Open it now"
          },
          {
            "word": "SEAL",
            "label": "Wait for the board"
          }
        ]
      },
      "branches": {
        "OPEN": "She breaks the seal in the strongroom. Inside is her father's letter and a second key, not the one she holds.",
        "SEAL": "She keeps the envelope sealed and walks past the manager. By midnight it is gone from her room."
      },
      "slots": [
        {
          "key": "ledger_phone",
          "object": "the supervisor's phone showing the changed ledger",
          "slide": 5,
          "house": "Instagram GIF Maker"
        },
        {
          "key": "safe",
          "object": "the strongroom safe",
          "slide": 6,
          "house": "Luma lux"
        }
      ],
      "alux": {
        "product": "The Gear Equalizer — Pro Studio Upgrade",
        "where": "the faded founder's portrait in the strongroom, relit on Ekaette's phone to read the brass plate, slide 4",
        "word": "LIGHT",
        "line": "The founder's birth date was lost in a dark portrait. Comment LIGHT and we'll relight yours."
      }
    },
    {
      "n": 3,
      "after": "*.OPEN",
      "title": "The Second Key",
      "slides": [
        {
          "kind": "cover",
          "see": "Strongroom in morning light: the torn envelope on the steel table, Ekaette holding an old letter and a small second key, the lawyer behind her in shadow, rain on the high window.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Close on the strongroom table, the torn seal, the founder's letter under Ekaette's hand, dust in the hard light.",
          "say": "9 a.m. She opened the envelope alone.",
          "scene": "Strongroom. Morning."
        },
        {
          "kind": "text",
          "see": "Close on the founder's letter in faded ink, one line pressed darker than the rest, Ekaette's thumb beneath it. The second key lies beside the page.",
          "say": "Her father's letter: “The truth is in the carnival ledger.”",
          "scene": "A letter. A second key."
        },
        {
          "kind": "beat",
          "see": "Linen closet: Emem clutches a black ledger to her chest, still in her navy blazer, a nursing induction portrait of her mother pinned inside her open locker.",
          "say": "The front-desk supervisor has the ledger. She is afraid.",
          "scene": "The supervisor, holding the ledger."
        },
        {
          "kind": "line",
          "who": "emem",
          "see": "Emem close to Ekaette in the linen closet, whispering, the ledger pressed between them, the locker mirror showing both faces.",
          "say": "“If I give it, she will say I stole it.”",
          "scene": "A staff card on the table."
        },
        {
          "kind": "beat",
          "see": "Outside, the carnival stage is half built on the Marina, red banners snapping in the rain. Nkoyo rehearses into a microphone, Akanimo holding the sale papers.",
          "say": "On the carnival stage, the manager rehearses her speech.",
          "scene": "The carnival stage, half built."
        },
        {
          "kind": "cliff",
          "who": "nkoyo",
          "see": "Nkoyo on the carnival stage holding Ekaette's staff card high, security closing in, red banners dripping behind her, staff watching from under umbrellas.",
          "say": "The manager suspends her in front of the staff.",
          "scene": "A staff card, held high."
        },
        {
          "kind": "choice",
          "see": "Close on the black ledger in Emem's hands and Ekaette's staff card on the wet stage, rain spotting both.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "loss"
      },
      "choice": {
        "question": "Does Ekaette expose the fraud now?",
        "options": [
          {
            "word": "EXPOSE",
            "label": "Name it publicly"
          },
          {
            "word": "PROTECT",
            "label": "Shield Emem"
          }
        ]
      },
      "branches": {
        "EXPOSE": "She reads the altered ledger aloud on the carnival stage. The crowd turns; the manager calls security.",
        "PROTECT": "She hides the supervisor's name and confronts the manager alone. The manager fires the supervisor before midnight."
      },
      "slots": [
        {
          "key": "ledger",
          "object": "the carnival ledger in the supervisor's hands",
          "slide": 4,
          "house": "The Asset Extractor"
        },
        {
          "key": "staff_card",
          "object": "the cleaner's staff card on the table",
          "slide": 5,
          "house": "Noir Director Editorial"
        }
      ],
      "alux": {
        "product": "Nursing Induction",
        "where": "the framed nursing induction portrait of Emem's mother inside her open locker, slide 4"
      }
    },
    {
      "n": 3,
      "after": "*.SEAL",
      "title": "The Missing Envelope",
      "slides": [
        {
          "kind": "cover",
          "see": "The cleaner's small room above the laundry: an open drawer, the grey uniform on the bed, the founder's sealed envelope gone, rain on the tiny window.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "The small room at nine in the morning, bare bulb, open drawer, Ekaette standing still in her uniform, the bed untouched.",
          "say": "9 a.m. The envelope stayed sealed.",
          "scene": "Her room. Nine a.m."
        },
        {
          "kind": "beat",
          "see": "Close on the empty drawer, the brass key still in the lock, a cleaner's cap fallen on the floor, the door open behind.",
          "say": "Her room is open. The envelope is gone.",
          "scene": "An open drawer. No envelope."
        },
        {
          "kind": "line",
          "who": "emem",
          "see": "Emem in the linen closet doorway, navy blazer, lanyard twisted in her fingers, a nursing induction portrait of her mother visible in the open locker behind.",
          "say": "“The manager had a key to every room.”",
          "scene": "A whisper in the linen closet."
        },
        {
          "kind": "text",
          "see": "Close on a folded note pushed under the room door, block letters, no signature, rain light moving across the floor.",
          "say": "A note under the door: “Carnival stage. Noon.”",
          "scene": "A note under the door."
        },
        {
          "kind": "beat",
          "see": "Carnival stage at noon: staff gathered under umbrellas, Nkoyo holding the founder's sealed envelope above her head, Akanimo beside her with the leather folder.",
          "say": "The manager holds the envelope up before the staff.",
          "scene": "The staff gathered at the stage."
        },
        {
          "kind": "cliff",
          "who": "nkoyo",
          "see": "Nkoyo on the carnival stage holding Ekaette's staff card high, security closing in, red banners dripping behind her, staff watching from under umbrellas.",
          "say": "The manager suspends her in front of the staff.",
          "scene": "A staff card, held high."
        },
        {
          "kind": "choice",
          "see": "Close on the black ledger in Emem's hands and Ekaette's staff card on the wet stage, rain spotting both.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "loss"
      },
      "choice": {
        "question": "Does Ekaette expose the fraud now?",
        "options": [
          {
            "word": "EXPOSE",
            "label": "Name it publicly"
          },
          {
            "word": "PROTECT",
            "label": "Shield Emem"
          }
        ]
      },
      "branches": {
        "EXPOSE": "She reads the altered ledger aloud on the carnival stage. The crowd turns; the manager calls security.",
        "PROTECT": "She hides the supervisor's name and confronts the manager alone. The manager fires the supervisor before midnight."
      },
      "slots": [
        {
          "key": "note",
          "object": "the note under the door",
          "slide": 5,
          "house": "Noir Director Editorial"
        },
        {
          "key": "envelope",
          "object": "the sealed envelope in the manager's hand",
          "slide": 6,
          "house": "Luma lux"
        }
      ],
      "alux": {
        "product": "Nursing Induction",
        "where": "the framed nursing induction portrait of Emem's mother inside her open locker, slide 4"
      }
    },
    {
      "n": 4,
      "after": "*.EXPOSE",
      "title": "The Carnival Stage",
      "slides": [
        {
          "kind": "cover",
          "see": "The carnival stage at noon, rain falling through red lights, a crowd under umbrellas, Ekaette holding the black ledger, Nkoyo with a microphone, Akanimo at the edge.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Wide on the stage, wet boards, carnival masks glistening, Ekaette small before the microphone, the crowd pressing close.",
          "say": "Noon. She named the fraud on the carnival stage.",
          "scene": "Carnival stage. Noon."
        },
        {
          "kind": "line",
          "who": "nkoyo",
          "see": "Nkoyo with the microphone, red gown sharp against the black-and-white rain, one finger pointed at Ekaette, security moving at the stage edge.",
          "say": "“Security. Remove this cleaner from my stage.”",
          "scene": "The microphone, in her face."
        },
        {
          "kind": "beat",
          "see": "Emem steps in front of Ekaette, lanyard flying, phones rising in the crowd, the lobby screen behind them looping the altered ledger as a moving clip.",
          "say": "The supervisor stands in front of her. Phones rise.",
          "scene": "Phones rise in the rain."
        },
        {
          "kind": "text",
          "see": "Close on Akanimo's phone under the stage light: a message reading Sale signing moved to midnight. Board quorum secured. His thumb covers the sender.",
          "say": "The consultant's phone: signing moved to midnight.",
          "scene": "A phone. Midnight signing."
        },
        {
          "kind": "beat",
          "see": "Hotel entrance: Chief Asuquo signs the sale papers on the bonnet of a black car, reading glasses pushed up, not reading the page. Rain on his white agbada.",
          "say": "The chairman signs the sale papers without reading.",
          "scene": "Papers signed at the entrance."
        },
        {
          "kind": "cliff",
          "who": "nkoyo",
          "see": "Nkoyo in the hotel entrance holding up the signed sale page; behind her, a locksmith fits a new brass lock to the penthouse lift door; rain on the Marina beyond.",
          "say": "The manager holds up the signed page. The penthouse lock is changed.",
          "scene": "A signed page. A new lock."
        },
        {
          "kind": "choice",
          "see": "Close on the signed page in Nkoyo's hand, the new brass lock beside it, Ekaette's old key on the wet step below.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "loss"
      },
      "choice": {
        "question": "Does Ekaette fight the sale or deal?",
        "options": [
          {
            "word": "FIGHT",
            "label": "Fight in court"
          },
          {
            "word": "SIGN",
            "label": "Sign their terms"
          }
        ]
      },
      "branches": {
        "FIGHT": "She gets an injunction before dawn. The manager answers with a fire-safety closure that sends staff home.",
        "SIGN": "She signs the consultant's terms to keep every job. At dawn, the manager adds a clause she did not read."
      },
      "slots": [
        {
          "key": "stage_mic",
          "object": "the microphone on the carnival stage",
          "slide": 3,
          "house": "Penthouse Dusk Paparazzi"
        },
        {
          "key": "consultant_phone",
          "object": "the consultant's phone",
          "slide": 5,
          "house": "Instagram GIF Maker"
        }
      ],
      "alux": {
        "product": "Instagram GIF Maker",
        "where": "the lobby screen looping the altered ledger as a moving clip, slide 4",
        "word": "GIF",
        "line": "The ledger played on a loop nobody could edit. Comment GIF and we'll set your photo moving."
      }
    },
    {
      "n": 4,
      "after": "*.PROTECT",
      "title": "The Fired Supervisor",
      "slides": [
        {
          "kind": "cover",
          "see": "The staff locker room at noon: Emem emptying her locker into a cardboard box, Ekaette standing in the doorway, the manager's shadow long across the floor.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Wide on the locker room, one locker open and bare, Emem's cardboard box on the bench, staff watching from the corridor.",
          "say": "Noon. She kept her friend's name out of it.",
          "scene": "The staff lockers. Noon."
        },
        {
          "kind": "beat",
          "see": "Close on Emem's hands lifting her lanyard from the locker hook, folding it once, placing it in the box. Nobody speaks.",
          "say": "The supervisor empties her locker. Nobody speaks.",
          "scene": "An emptied locker. Nobody speaks."
        },
        {
          "kind": "line",
          "who": "nkoyo",
          "see": "Nkoyo in the manager's office doorway, clipboard against her chest, red lips, eyes on Ekaette, Emem's box between them.",
          "say": "“One cleaner, one liar. The hotel stays clean.”",
          "scene": "The manager's office, door closed."
        },
        {
          "kind": "text",
          "see": "Close on the manager's desk: sale papers, a leather folder, a phone lighting up with the Crestline logo. The lobby screen beyond the glass loops the altered ledger.",
          "say": "The sale papers are already on the manager's desk.",
          "scene": "Sale papers on the desk."
        },
        {
          "kind": "beat",
          "see": "Hotel entrance: Chief Asuquo signs at the bonnet of a black car, reading glasses pushed up, not reading. Rain on his white agbada and the carnival banners.",
          "say": "The chairman signs at the entrance. He does not read.",
          "scene": "The chairman's pen at the entrance."
        },
        {
          "kind": "cliff",
          "who": "nkoyo",
          "see": "Nkoyo in the hotel entrance holding up the signed sale page; behind her, a locksmith fits a new brass lock to the penthouse lift door; rain on the Marina beyond.",
          "say": "The manager holds up the signed page. The penthouse lock is changed.",
          "scene": "A signed page. A new lock."
        },
        {
          "kind": "choice",
          "see": "Close on the signed page in Nkoyo's hand, the new brass lock beside it, Ekaette's old key on the wet step below.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "loss"
      },
      "choice": {
        "question": "Does Ekaette fight the sale or deal?",
        "options": [
          {
            "word": "FIGHT",
            "label": "Fight in court"
          },
          {
            "word": "SIGN",
            "label": "Sign their terms"
          }
        ]
      },
      "branches": {
        "FIGHT": "She gets an injunction before dawn. The manager answers with a fire-safety closure that sends staff home.",
        "SIGN": "She signs the consultant's terms to keep every job. At dawn, the manager adds a clause she did not read."
      },
      "slots": [
        {
          "key": "locker",
          "object": "the supervisor's emptied locker",
          "slide": 3,
          "house": "The Asset Extractor"
        },
        {
          "key": "sale_papers",
          "object": "the sale papers on the manager's desk",
          "slide": 5,
          "house": "Noir Director Editorial"
        }
      ],
      "alux": {
        "product": "Instagram GIF Maker",
        "where": "the lobby screen looping the altered ledger as a moving clip, slide 4",
        "word": "GIF",
        "line": "The ledger played on a loop nobody could edit. Comment GIF and we'll set your photo moving."
      }
    },
    {
      "n": 5,
      "after": "*.FIGHT",
      "title": "The Pledge",
      "slides": [
        {
          "kind": "cover",
          "see": "The carnival ball at the Marina Crest: chandeliers, black-and-white column gowns, one emerald dress, rain on the ballroom glass. Ekaette in simple black at the edge, Nkoyo at the centre.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Wide on the ballroom, carnival masks on the tables, rain streaking the tall windows, a small orchestra in the corner.",
          "say": "Evening. She took the sale to court.",
          "scene": "The carnival ball. Evening."
        },
        {
          "kind": "beat",
          "see": "Nkoyo in an emerald beaded gown reads a court injunction by candlelight, smiling. Ekaette in black watches from across the room, a glass untouched in her hand.",
          "say": "The manager reads the injunction. She smiles anyway.",
          "scene": "An injunction in her hand."
        },
        {
          "kind": "line",
          "who": "nkoyo",
          "see": "Nkoyo close to Ekaette by the tall window, emerald gown sharp, voice low, the carnival lights red beyond the rain.",
          "say": "“You stopped a sale. You did not stop the debt.”",
          "scene": "A yellowed pledge, unfolded."
        },
        {
          "kind": "text",
          "see": "Close on a yellowed pledge in Nkoyo's gloved hand: ten percent of the founder's shares pledged if a private loan is unpaid by carnival night. A faded signature.",
          "say": "A yellowed pledge: ten percent, if the loan is unpaid.",
          "scene": "The chairman, looking away."
        },
        {
          "kind": "beat",
          "see": "Chief Asuquo by the ballroom door, white agbada, reading glasses in his hand, looking away. Akanimo stands very still beside him.",
          "say": "The chairman admits he signed without reading.",
          "scene": "The manager, smiling."
        },
        {
          "kind": "cliff",
          "who": "nkoyo",
          "see": "Nkoyo at the carnival ball holding a yellowed pledge up to the chandelier light; Chief Asuquo looking away; Ekaette in black, still.",
          "say": "The manager holds up the pledge. “The hotel is mine.”",
          "scene": "The pledge, held high."
        },
        {
          "kind": "choice",
          "see": "Close on the yellowed pledge in Nkoyo's hand, the founder's faded signature, Ekaette's brass key on the table below it.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "reveal"
      },
      "choice": {
        "question": "Does Ekaette pay the debt tonight?",
        "options": [
          {
            "word": "PAY",
            "label": "Pay it now"
          },
          {
            "word": "CHALLENGE",
            "label": "Challenge the pledge"
          }
        ]
      },
      "branches": {
        "PAY": "She pays the loan from her own account before midnight. The manager tears the pledge, then asks about the second letter.",
        "CHALLENGE": "She asks the supervisor for the ledger. Every loan payment is already recorded there."
      },
      "slots": [
        {
          "key": "gown",
          "object": "the manager's emerald carnival gown",
          "slide": 3,
          "house": "Emerald Empress: Beaded Column Gown with Draped Veil"
        },
        {
          "key": "pledge",
          "object": "the yellowed pledge",
          "slide": 5,
          "house": "The Asset Extractor"
        }
      ],
      "alux": {
        "product": "Emerald Empress: Beaded Column Gown with Draped Veil",
        "where": "the manager's emerald gown at the carnival ball, slide 3"
      }
    },
    {
      "n": 5,
      "after": "*.SIGN",
      "title": "Clause Nineteen",
      "slides": [
        {
          "kind": "cover",
          "see": "The carnival ball at the Marina Crest: Ekaette in black at a small table with Akanimo's contract, Nkoyo in emerald watching from the dance floor, rain on the glass.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Wide on the ballroom, a contract open on the white tablecloth, carnival masks and candles, the orchestra playing low.",
          "say": "Evening. She signed the consultant's terms.",
          "scene": "The ballroom. Evening."
        },
        {
          "kind": "beat",
          "see": "Akanimo slides the contract across the table to Ekaette, pen ready, rimless glasses catching the chandelier. Nkoyo watches from the dance floor, emerald gown still.",
          "say": "The consultant brings the contract to the carnival ball.",
          "scene": "A contract on the table."
        },
        {
          "kind": "text",
          "see": "Close on clause nineteen, underlined in Akanimo's pen: the manager's private loan is secured on the founder's shares.",
          "say": "Clause nineteen: the manager's loan is secured on shares.",
          "scene": "Clause nineteen, underlined."
        },
        {
          "kind": "line",
          "who": "akanimo",
          "see": "Akanimo leaning close across the contract, voice low, eyes on Ekaette; Nkoyo blurred in emerald behind him.",
          "say": "“You signed to save jobs. She signed to take the hotel.”",
          "scene": "The consultant, very still."
        },
        {
          "kind": "beat",
          "see": "Chief Asuquo by the ballroom door, white agbada, reading glasses in his hand, looking away. Nkoyo's yellowed pledge is already in her glove.",
          "say": "The chairman admits he never read the sale.",
          "scene": "The chairman, looking away."
        },
        {
          "kind": "cliff",
          "who": "nkoyo",
          "see": "Nkoyo at the carnival ball holding a yellowed pledge up to the chandelier light; Chief Asuquo looking away; Ekaette in black, still.",
          "say": "The manager holds up the pledge. “The hotel is mine.”",
          "scene": "The pledge, held high."
        },
        {
          "kind": "choice",
          "see": "Close on the yellowed pledge in Nkoyo's hand, the founder's faded signature, Ekaette's brass key on the table below it.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "reveal"
      },
      "choice": {
        "question": "Does Ekaette pay the debt tonight?",
        "options": [
          {
            "word": "PAY",
            "label": "Pay it now"
          },
          {
            "word": "CHALLENGE",
            "label": "Challenge the pledge"
          }
        ]
      },
      "branches": {
        "PAY": "She pays the loan from her own account before midnight. The manager tears the pledge, then asks about the second letter.",
        "CHALLENGE": "She asks the supervisor for the ledger. Every loan payment is already recorded there."
      },
      "slots": [
        {
          "key": "contract",
          "object": "the consultant's contract",
          "slide": 3,
          "house": "The Asset Extractor"
        },
        {
          "key": "gown",
          "object": "the manager's emerald carnival gown",
          "slide": 4,
          "house": "Emerald Empress: Beaded Column Gown with Draped Veil"
        }
      ],
      "alux": {
        "product": "Emerald Empress: Beaded Column Gown with Draped Veil",
        "where": "the manager's emerald gown at the carnival ball, slide 4"
      }
    },
    {
      "n": 6,
      "after": "*.PAY",
      "title": "The Second Letter",
      "slides": [
        {
          "kind": "cover",
          "see": "Carnival night in the Marina Crest ballroom: rain stopped, red lanterns on the terrace, Ekaette at the head table in black, a masked woman approaching with a faded photograph.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Wide on the ballroom after midnight, staff and guests still standing, red carnival lanterns reflected in the wet windows.",
          "say": "Carnival night. She paid the manager's loan.",
          "scene": "Carnival night. The ballroom."
        },
        {
          "kind": "beat",
          "see": "Nkoyo signs a resignation letter at the table, the torn pledge beside it, staff watching from the edge of the dance floor, rain gone from the glass.",
          "say": "The manager signs her resignation. The pledge is torn.",
          "scene": "A resignation. A torn pledge."
        },
        {
          "kind": "line",
          "who": "ekaette",
          "see": "Ekaette standing at the head table, simple black dress, brass key on its red ribbon at her wrist, the whole ballroom turned to her.",
          "say": "“The hotel stays open. Every job stays.”",
          "scene": "The staff, listening."
        },
        {
          "kind": "beat",
          "see": "The owner's office: founder's portrait on the wall, brass key on the desk, a red carnival mask left on the chair, rain drying on the window.",
          "say": "In the owner's office, the brass key is on the desk.",
          "scene": "The owner's office. One key."
        },
        {
          "kind": "text",
          "see": "Close on an old photograph sliding under the office door: the founder young, a woman beside him, a small child between them. The year 1999 is written on the back.",
          "say": "A photograph slides under the door: her father, another woman, a child.",
          "scene": "A photograph under the door."
        },
        {
          "kind": "cliff",
          "see": "The owner's office doorway: a woman in a red carnival mask, rain behind her, a faded photograph and a sealed letter in her gloved hand; Ekaette at the desk, brass key under her palm.",
          "say": "A masked woman holds a second letter. “He wrote this for me.”",
          "scene": "A mask, removed."
        },
        {
          "kind": "choice",
          "see": "Close on the sealed letter and the old photograph on the owner's desk, the red carnival mask beside them, Ekaette's brass key at the edge.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "arrival"
      },
      "choice": {
        "question": "Does Ekaette hear the woman out?",
        "options": [
          {
            "word": "LISTEN",
            "label": "Hear her out"
          },
          {
            "word": "CLOSE",
            "label": "Send her away"
          }
        ]
      },
      "branches": {
        "LISTEN": "Season two: the woman is the founder's other daughter. She holds the missing ten percent and a plan for the old wing.",
        "CLOSE": "Season two: Ekaette sends her away. At dawn the woman buys the hotel next door and hangs the same photograph in its window."
      },
      "slots": [
        {
          "key": "key",
          "object": "the brass key on the owner's desk",
          "slide": 5,
          "house": "Luma lux"
        },
        {
          "key": "photo",
          "object": "the old photograph sliding under the door",
          "slide": 6,
          "house": "The Gear Equalizer — Pro Studio Upgrade"
        }
      ],
      "alux": {
        "product": "Noir Director Editorial",
        "where": "the founder's portrait on the owner's office wall, slide 5",
        "word": "BOOK",
        "line": "The founder's portrait hangs in the owner's office. Comment BOOK and we'll make one worth a wall."
      },
      "finale": true
    },
    {
      "n": 6,
      "after": "*.CHALLENGE",
      "title": "The Ledger Speaks",
      "slides": [
        {
          "kind": "cover",
          "see": "Carnival night in the boardroom above the ball: Ekaette in black at the head of the long table, Emem laying the black ledger down, Nkoyo standing very still.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Wide on the boardroom, the carnival lights red through the tall windows, the board seated, the black ledger alone in the centre.",
          "say": "Carnival night. She challenged the pledge aloud.",
          "scene": "Carnival night. The boardroom."
        },
        {
          "kind": "beat",
          "see": "Emem lays the ledger before the board, her lanyard straight, one page open to the loan payments. The directors lean in; Nkoyo's hands are flat on the table.",
          "say": "The supervisor lays the ledger before the board.",
          "scene": "A ledger before the board."
        },
        {
          "kind": "line",
          "who": "nkoyo",
          "see": "Nkoyo at the far end of the table, emerald gown dull in the boardroom light, voice low and bitter.",
          "say": "“You have won a hotel. You have lost a family.”",
          "scene": "The manager, silent."
        },
        {
          "kind": "beat",
          "see": "The board votes by raised hands; Nkoyo's chair empty; Ekaette alone at the head of the table with the brass key in her palm, founder's portrait behind her.",
          "say": "The board votes the manager out. The key is hers.",
          "scene": "An empty chair. A key."
        },
        {
          "kind": "text",
          "see": "Close on an old photograph sliding under the boardroom door: the founder young, a woman beside him, a small child between them. The year 1999 is written on the back.",
          "say": "A photograph slides under the door: her father, another woman, a child.",
          "scene": "A photograph under the door."
        },
        {
          "kind": "cliff",
          "see": "The boardroom doorway: a woman in a red carnival mask, rain behind her, a faded photograph and a sealed letter in her gloved hand; Ekaette at the table, brass key under her palm.",
          "say": "A masked woman holds a second letter. “He wrote this for me.”",
          "scene": "A mask, removed."
        },
        {
          "kind": "choice",
          "see": "Close on the sealed letter and the old photograph on the boardroom table, the red carnival mask beside them, Ekaette's brass key at the edge.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "arrival"
      },
      "choice": {
        "question": "Does Ekaette hear the woman out?",
        "options": [
          {
            "word": "LISTEN",
            "label": "Hear her out"
          },
          {
            "word": "CLOSE",
            "label": "Send her away"
          }
        ]
      },
      "branches": {
        "LISTEN": "Season two: the woman is the founder's other daughter. She holds the missing ten percent and a plan for the old wing.",
        "CLOSE": "Season two: Ekaette sends her away. At dawn the woman buys the hotel next door and hangs the same photograph in its window."
      },
      "slots": [
        {
          "key": "ledger",
          "object": "the ledger laid before the board",
          "slide": 3,
          "house": "The Asset Extractor"
        },
        {
          "key": "photo",
          "object": "the old photograph sliding under the door",
          "slide": 6,
          "house": "The Gear Equalizer — Pro Studio Upgrade"
        }
      ],
      "alux": {
        "product": "Noir Director Editorial",
        "where": "the founder's portrait on the boardroom wall, slide 5",
        "word": "BOOK",
        "line": "The founder's portrait hangs in the boardroom. Comment BOOK and we'll make one worth a wall."
      },
      "finale": true
    }
  ]
};
