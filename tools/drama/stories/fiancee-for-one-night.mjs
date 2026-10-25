// Fiancée for One Night — written by the screenwriter (tools/drama/screenwriter.mjs, deepseek-flash) on 2026-10-25
// from the brief: Fiancée for One Night: a waitress at a Lekki restaurant agrees to play a rich man's fiancée at his family's Sunday dinner in Ikoyi — one night, one envelope of cash, no questions — and his sister recognises her as the waitress who served them yesterday. Feeling: I will never fit into their world. Opens on the sister pointing across the table: You served us yesterday. Lagos, old money in Ikoyi, new money in Lekki, Sunday rice and a mother who misses nothing.
// Check with `node tools/drama/check.mjs fiancee-for-one-night`, read it like an editor, then seed with scripts/drama-seed.mjs.
export default {
  "slug": "fiancee-for-one-night",
  "title": "Fiancée for One Night",
  "tagline": "One dinner. One envelope. One lie.",
  "genre": "romance",
  "city": "Lagos",
  "logline": "A Lekki waitress takes cash to pose as a rich man's fiancée at his family's Ikoyi Sunday dinner. His sister knows her face. His mother misses nothing.",
  "minVotes": 2,
  "cast": [
    {
      "key": "amaka",
      "name": "Amaka Obi",
      "age": 27,
      "role": "Waitress at The Palm Room, Lekki",
      "archetype": "The Hustler",
      "side": "light",
      "tier": "lead",
      "open": true,
      "look": "Slim, quick-eyed, natural hair in a low puff, small gold hoops, white waitress shirt and black apron; for the dinner, a borrowed emerald dress and her mother's beads.",
      "want": "To pay her brother's school fees and keep her mother's stall open.",
      "secret": "Her father was the Coker family's accountant, ruined and jailed for a fraud he did not commit."
    },
    {
      "key": "femi",
      "name": "Femi Coker",
      "age": 32,
      "role": "Heir to Coker Group",
      "archetype": "The Oga",
      "side": "too little",
      "tier": "main",
      "open": true,
      "look": "Tall, lean, tailored linen, a quiet voice, a signet ring he turns when nervous.",
      "want": "To inherit his father's company and keep it out of his cousin's hands.",
      "secret": "The company is already insolvent; he needs the inheritance to save it, and he has no fiancée."
    },
    {
      "key": "bisola",
      "name": "Bisola Coker",
      "age": 29,
      "role": "Femi's sister, runs a gallery in Ikoyi",
      "archetype": "The Jester",
      "side": "light",
      "tier": "main",
      "open": true,
      "look": "Bold, close-shaved hair, oversized earrings, a printed agbada over jeans, always holding a phone.",
      "want": "To protect her brother without becoming her mother.",
      "secret": "She recognised Amaka because she was at the restaurant yesterday — and she has been quietly selling her art to cover the family's debts."
    },
    {
      "key": "funmilayo",
      "name": "Chief Mrs Funmilayo Coker",
      "age": 61,
      "role": "Matriarch of the Coker family",
      "archetype": "The Guardian",
      "side": "too much",
      "tier": "main",
      "open": true,
      "look": "Upright, silver-streaked hair under a perfect gele, emerald lace, pearls, eyes that miss nothing.",
      "want": "To see Femi married to the right woman and the Coker name restored.",
      "secret": "She knows the family is broke and has been selling property secretly; she also knows what happened to Amaka's father."
    },
    {
      "key": "kunle",
      "name": "Kunle Coker",
      "age": 34,
      "role": "Femi's cousin, runs a rival logistics firm",
      "archetype": "The Visionary",
      "side": "too much",
      "tier": "main",
      "open": true,
      "look": "Broad, smooth, designer agbada, a laugh too loud, a gold watch he checks too often.",
      "want": "To take over Coker Group when Femi fails the will's condition.",
      "secret": "He leaked the family's debt to the press and plans to buy the shares cheap."
    },
    {
      "key": "nkechi",
      "name": "Nkechi Obi",
      "age": 52,
      "role": "Amaka's mother, market trader in Yaba",
      "archetype": "The Guardian",
      "side": "light",
      "tier": "cameo",
      "open": true,
      "look": "Small, strong, wrapper and blouse, a scarf tied at her waist, hands always working.",
      "want": "To keep her stall and see her children safe.",
      "secret": "She has a letter from Amaka's father proving the Cokers framed him."
    }
  ],
  "episodes": [
    {
      "n": 1,
      "title": "The Sunday Dinner",
      "slides": [
        {
          "kind": "hook",
          "see": "Designed hook: a white envelope on a white tablecloth, a gold fork beside it.",
          "say": "A Lekki waitress takes cash to play a rich man's fiancée at his family's Sunday dinner. His sister knows her face. His mother misses nothing."
        },
        {
          "kind": "cover",
          "see": "Cover: a long Ikoyi dining table in Sunday light, white cloth, crystal, one empty chair at the far end.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "The Coker house from the gate: white columns, a green lawn, a long black car in the drive. Sunday light.",
          "say": "Ikoyi, Sunday. Rice and old money.",
          "scene": "White cloth. Crystal. One empty chair."
        },
        {
          "kind": "beat",
          "who": "amaka",
          "see": "Amaka at the high gate, a white envelope in her handbag, the house long and white behind her.",
          "say": "She checks the envelope. One night. No questions.",
          "scene": "At the gate. An envelope."
        },
        {
          "kind": "line",
          "who": "femi",
          "see": "Femi at the car, straightening his cuff, not looking at her.",
          "say": "“My mother will ask about your family. Say little.”",
          "scene": "In the driveway, he coaches her."
        },
        {
          "kind": "beat",
          "who": "funmilayo",
          "see": "At the table, Funmilayo's eyes on Amaka's hands as she lifts the water glass.",
          "say": "The mother watches her hands, not her face.",
          "scene": "The mother watches her hands."
        },
        {
          "kind": "beat",
          "who": "bisola",
          "see": "Bisola in the doorway, a glass of wine halfway, staring at Amaka.",
          "say": "The sister stops in the doorway. She knows the face.",
          "scene": "In the doorway, the sister stops."
        },
        {
          "kind": "cliff",
          "who": "bisola",
          "see": "Bisola pointing across the table, every head turning.",
          "say": "“You served us yesterday. At The Palm Room.”",
          "scene": "She points across the table."
        },
        {
          "kind": "choice",
          "see": "Close on the white envelope in Amaka's lap, half under the napkin.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "reveal"
      },
      "choice": {
        "question": "Does Amaka admit she served them?",
        "options": [
          {
            "word": "ADMIT",
            "label": "Tell the truth"
          },
          {
            "word": "DENY",
            "label": "Play the stranger"
          }
        ]
      },
      "branches": {
        "ADMIT": "Amaka admits it. The mother sets down her spoon. Femi's hand finds Amaka's under the table.",
        "DENY": "Amaka denies it. Bisola smiles and lets it go — then produces the restaurant receipt from her bag."
      },
      "slots": [
        {
          "key": "dress",
          "object": "the borrowed emerald dress Amaka wears",
          "slide": 4,
          "house": "Emerald Empress: Beaded Column Gown with Draped Veil"
        },
        {
          "key": "portrait",
          "object": "the framed family portrait in the hall",
          "slide": 3,
          "house": "Noir Director Editorial"
        }
      ],
      "alux": {
        "product": "Emerald Empress: Beaded Column Gown with Draped Veil",
        "where": "the borrowed emerald dress Amaka wears, slide 4"
      }
    }
  ],
  "voices": {
    "narrator": {
      "gender": "male",
      "language": "en-US",
      "designed": "A film-trailer narrator: low, unhurried, each line a small verdict, warm at the edges, never mocking; the voice that tells you the truth before the characters do."
    },
    "amaka": {
      "gender": "female",
      "nigerian": "Lagos-born, Igbo parents from Anambra; English with a faint Igbo lilt, mid-pitch, quick and warm, laughs to cover her nerves, then goes very quiet when she means it, the voice of a woman who has learned to serve and to listen."
    },
    "femi": {
      "gender": "male",
      "nigerian": "Lagos old money, Yoruba; measured, low, never hurries; English with a soft Yoruba cadence, the voice of a man taught not to raise it, even when he should. A pause before every answer."
    },
    "bisola": {
      "gender": "female",
      "nigerian": "Lagos, Yoruba; clipped and playful, a fast laugh, English with a boarding-school polish, drops into Yoruba when she teases, never cruel. The voice of the sister who sees everything and says half."
    },
    "funmilayo": {
      "gender": "female",
      "nigerian": "Ibadan-born Yoruba; deep and deliberate, English with a queen's cadence, every word placed like a plate, the voice of a woman who has never been contradicted in her own house."
    },
    "kunle": {
      "gender": "male",
      "nigerian": "Lagos Yoruba; broad and hearty, English with a market edge, laughs at his own lines, the voice of a man who wants you to think he is your friend."
    },
    "nkechi": {
      "gender": "female",
      "nigerian": "Onitsha-born Igbo; market English, high and quick, then soft when she means it, the voice of a woman who has carried her family on her back and will do it again."
    }
  },
  "drafts": [
    {
      "n": 2,
      "after": "ADMIT",
      "title": "The Invitation",
      "slides": [
        {
          "kind": "hook",
          "see": "Designed hook: the family table from above, every plate untouched, one chair pushed back.",
          "say": "The story so far: the waitress admitted she served the family yesterday. The table went silent. The mother set down her spoon. Now the Cokers ask her to stay for the week."
        },
        {
          "kind": "cover",
          "see": "Cover: the Coker house in morning light, a white envelope on the hall table.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Monday morning. The Coker house. A tray of tea on the veranda.",
          "say": "Monday morning. The Coker house.",
          "scene": "Morning light. A tray of tea."
        },
        {
          "kind": "beat",
          "who": "amaka",
          "see": "Amaka in a guest room, the emerald dress on a chair.",
          "say": "Amaka wakes in a guest room.",
          "scene": "A guest room. The dress on a chair."
        },
        {
          "kind": "line",
          "who": "bisola",
          "see": "Bisola entering with a tray, a knowing smile.",
          "say": "“You admitted it. Brave. Or stupid.”",
          "scene": "Bisola brings tea. A smile."
        },
        {
          "kind": "beat",
          "who": "funmilayo",
          "see": "Funmilayo in the doorway, not entering, gloves in her hand.",
          "say": "“Stay the week. Friday lunch. Your mother too.”",
          "scene": "The mother in the doorway."
        },
        {
          "kind": "beat",
          "who": "femi",
          "see": "Femi in the hall, phone to his ear, watching Amaka.",
          "say": "Femi says nothing. He is calculating.",
          "scene": "In the hall, he watches her."
        },
        {
          "kind": "cliff",
          "who": "funmilayo",
          "see": "Funmilayo lifting the white envelope from the hall table, holding it up.",
          "say": "“This fell from your bag. What is it?”",
          "scene": "The envelope, held up."
        },
        {
          "kind": "choice",
          "see": "Close on the white envelope in Funmilayo's hand, Amaka's bag open on the chair.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "reveal"
      },
      "choice": {
        "question": "Does Amaka stay the week or leave tonight?",
        "options": [
          {
            "word": "STAY",
            "label": "Stay the week"
          },
          {
            "word": "LEAVE",
            "label": "Leave tonight"
          }
        ]
      },
      "branches": {
        "STAY": "Amaka stays. The mother sets a place for her at every meal. Kunle watches from the head of the table.",
        "LEAVE": "Amaka leaves. Femi follows her to the gate and offers double the envelope to come back."
      },
      "slots": [
        {
          "key": "portrait",
          "object": "the late father's portrait in the hall",
          "slide": 3,
          "house": "Noir Director Editorial"
        },
        {
          "key": "phone",
          "object": "Amaka's phone with a photo of her mother's stall",
          "slide": 4,
          "house": "Instagram GIF Maker"
        }
      ],
      "alux": {
        "product": "Noir Director Editorial",
        "where": "the late father's portrait in the hall, slide 3"
      }
    },
    {
      "n": 2,
      "after": "DENY",
      "title": "The Invitation",
      "slides": [
        {
          "kind": "hook",
          "see": "Designed hook: a restaurant receipt under a silver fork on a white tablecloth.",
          "say": "The story so far: the waitress denied it. The sister slid the restaurant receipt across the table. Now the Cokers ask her to stay for the week."
        },
        {
          "kind": "cover",
          "see": "Cover: the Coker house in morning light, a white envelope on the hall table.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Monday morning. The Coker house. A receipt on the breakfast table.",
          "say": "Monday morning. The Coker house.",
          "scene": "Morning light. A receipt on the cloth."
        },
        {
          "kind": "beat",
          "who": "bisola",
          "see": "Bisola buttering toast, the receipt folded under her knife.",
          "say": "Bisola has not shown the receipt to anyone. Yet.",
          "scene": "The receipt, under a fork."
        },
        {
          "kind": "line",
          "who": "bisola",
          "see": "Bisola buttering toast, the receipt folded under her knife.",
          "say": "“I know you lied. I don't mind a good lie.”",
          "scene": "She butters toast. The receipt waits."
        },
        {
          "kind": "beat",
          "who": "funmilayo",
          "see": "Funmilayo at the head of the table, not looking up from her plate.",
          "say": "“Stay the week. Friday lunch. Your mother too.”",
          "scene": "The mother, not looking up."
        },
        {
          "kind": "beat",
          "who": "femi",
          "see": "Femi at the window, back to the room.",
          "say": "Femi says nothing. He is calculating.",
          "scene": "At the window, his back turned."
        },
        {
          "kind": "cliff",
          "who": "funmilayo",
          "see": "Funmilayo lifting the white envelope from the hall table, holding it up.",
          "say": "“This fell from your bag. What is it?”",
          "scene": "The envelope, held up."
        },
        {
          "kind": "choice",
          "see": "Close on the white envelope in Funmilayo's hand, Amaka's bag open on the chair.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "reveal"
      },
      "choice": {
        "question": "Does Amaka stay the week or leave tonight?",
        "options": [
          {
            "word": "STAY",
            "label": "Stay the week"
          },
          {
            "word": "LEAVE",
            "label": "Leave tonight"
          }
        ]
      },
      "branches": {
        "STAY": "Amaka stays. The mother sets a place for her at every meal. Kunle watches from the head of the table.",
        "LEAVE": "Amaka leaves. Femi follows her to the gate and offers double the envelope to come back."
      },
      "slots": [
        {
          "key": "portrait",
          "object": "the late father's portrait in the hall",
          "slide": 3,
          "house": "Noir Director Editorial"
        },
        {
          "key": "phone",
          "object": "Amaka's phone with a photo of her mother's stall",
          "slide": 4,
          "house": "Instagram GIF Maker"
        }
      ],
      "alux": {
        "product": "Noir Director Editorial",
        "where": "the late father's portrait in the hall, slide 3"
      }
    },
    {
      "n": 3,
      "after": "*.STAY",
      "title": "The Condition",
      "slides": [
        {
          "kind": "hook",
          "see": "Designed hook: a leather document folder open on a dining table, a clock above the sideboard.",
          "say": "The story so far: the waitress stayed the week. Now the family lawyer reads the will: Femi must be engaged by Friday, or lose everything."
        },
        {
          "kind": "cover",
          "see": "Cover: the Coker dining room, the lawyer's folder open, the family seated.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Wednesday. The Coker dining room. The lawyer's folder is open.",
          "say": "Wednesday. The Coker dining room.",
          "scene": "A leather folder. A ticking clock."
        },
        {
          "kind": "beat",
          "who": "funmilayo",
          "see": "Funmilayo reading from a stiff document, glasses on.",
          "say": "“Engaged by Friday. Or the shares go to Kunle.”",
          "scene": "The mother reads. The room goes still."
        },
        {
          "kind": "beat",
          "who": "kunle",
          "see": "Kunle leaning back, a gold pen between his fingers.",
          "say": "Kunle smiles. He has waited for this.",
          "scene": "Kunle smiles. The pen spins."
        },
        {
          "kind": "line",
          "who": "funmilayo",
          "see": "Funmilayo closing the folder, looking at Amaka.",
          "say": "“Then we announce the engagement at Friday lunch.”",
          "scene": "She looks at Amaka. A decision."
        },
        {
          "kind": "beat",
          "who": "kunle",
          "see": "Kunle looking at Amaka's bare hand on the table.",
          "say": "Kunle looks at her hand. No ring.",
          "scene": "Her bare hand. His eyes."
        },
        {
          "kind": "cliff",
          "who": "kunle",
          "see": "Kunle pointing at Amaka's hand, every head turning.",
          "say": "“An engagement with no ring? Show us the ring.”",
          "scene": "He points. Every head turns."
        },
        {
          "kind": "choice",
          "see": "Close on Amaka's bare hand on the white tablecloth.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "clock"
      },
      "choice": {
        "question": "Does Femi tell his mother the truth?",
        "options": [
          {
            "word": "TELL",
            "label": "Tell her everything"
          },
          {
            "word": "HIDE",
            "label": "Keep the secret"
          }
        ]
      },
      "branches": {
        "TELL": "Femi tells her the engagement is fake. The mother's face does not move. She says: 'Then we make it real.'",
        "HIDE": "Femi takes Amaka's hand. 'The ring is being sized.' The mother watches his hand, not his face."
      },
      "slots": [
        {
          "key": "portrait",
          "object": "the late father's portrait above the sideboard",
          "slide": 3,
          "house": "Noir Director Editorial"
        },
        {
          "key": "phone",
          "object": "Amaka's phone face up on the table, a photo of her mother's stall",
          "slide": 5,
          "house": "Instagram GIF Maker"
        }
      ],
      "alux": {
        "product": "Noir Director Editorial",
        "where": "the late father's portrait above the sideboard, slide 3",
        "word": "BOOK",
        "line": "Comment BOOK and we'll make a portrait worth hanging."
      }
    },
    {
      "n": 3,
      "after": "*.LEAVE",
      "title": "The Condition",
      "slides": [
        {
          "kind": "hook",
          "see": "Designed hook: a leather document folder open on a dining table, a clock above the sideboard.",
          "say": "The story so far: the waitress left. Femi doubled the envelope. She returned. Now the lawyer reads the will: engaged by Friday, or lose everything."
        },
        {
          "kind": "cover",
          "see": "Cover: the Coker dining room, the lawyer's folder open, the family seated.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Wednesday. The Coker dining room. The lawyer's folder is open.",
          "say": "Wednesday. The Coker dining room.",
          "scene": "A leather folder. A ticking clock."
        },
        {
          "kind": "beat",
          "who": "funmilayo",
          "see": "Funmilayo reading from a stiff document, glasses on.",
          "say": "“Engaged by Friday. Or the shares go to Kunle.”",
          "scene": "The mother reads. The room goes still."
        },
        {
          "kind": "beat",
          "who": "kunle",
          "see": "Kunle leaning back, a gold pen between his fingers.",
          "say": "Kunle smiles. He has waited for this.",
          "scene": "Kunle smiles. The pen spins."
        },
        {
          "kind": "line",
          "who": "funmilayo",
          "see": "Funmilayo closing the folder, looking at Amaka.",
          "say": "“Then we announce the engagement at Friday lunch.”",
          "scene": "She looks at Amaka. A decision."
        },
        {
          "kind": "beat",
          "who": "kunle",
          "see": "Kunle looking at Amaka's bare hand on the table.",
          "say": "Kunle looks at her hand. No ring.",
          "scene": "Her bare hand. His eyes."
        },
        {
          "kind": "cliff",
          "who": "kunle",
          "see": "Kunle pointing at Amaka's hand, every head turning.",
          "say": "“An engagement with no ring? Show us the ring.”",
          "scene": "He points. Every head turns."
        },
        {
          "kind": "choice",
          "see": "Close on Amaka's bare hand on the white tablecloth.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "clock"
      },
      "choice": {
        "question": "Does Femi tell his mother the truth?",
        "options": [
          {
            "word": "TELL",
            "label": "Tell her everything"
          },
          {
            "word": "HIDE",
            "label": "Keep the secret"
          }
        ]
      },
      "branches": {
        "TELL": "Femi tells her the engagement is fake. The mother's face does not move. She says: 'Then we make it real.'",
        "HIDE": "Femi takes Amaka's hand. 'The ring is being sized.' The mother watches his hand, not his face."
      },
      "slots": [
        {
          "key": "portrait",
          "object": "the late father's portrait above the sideboard",
          "slide": 3,
          "house": "Noir Director Editorial"
        },
        {
          "key": "phone",
          "object": "Amaka's phone face up on the table, a photo of her mother's stall",
          "slide": 5,
          "house": "Instagram GIF Maker"
        }
      ],
      "alux": {
        "product": "Noir Director Editorial",
        "where": "the late father's portrait above the sideboard, slide 3",
        "word": "BOOK",
        "line": "Comment BOOK and we'll make a portrait worth hanging."
      }
    },
    {
      "n": 4,
      "after": "*.TELL",
      "title": "The Offer",
      "slides": [
        {
          "kind": "hook",
          "see": "Designed hook: a garden bench under a frangipani tree, a white envelope on the wood.",
          "say": "The story so far: Femi told his mother the engagement is fake. She said: then make it real. Now Kunle offers the waitress an envelope."
        },
        {
          "kind": "cover",
          "see": "Cover: the Coker garden at dusk, a white envelope on a bench.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Thursday evening. The Coker garden. Frangipani in the dark.",
          "say": "Thursday evening. The Coker garden.",
          "scene": "A garden bench. One lamp."
        },
        {
          "kind": "beat",
          "who": "kunle",
          "see": "Kunle stepping out from behind the hedge, envelope in hand.",
          "say": "Kunle steps out of the dark. An envelope.",
          "scene": "From the hedge, an envelope."
        },
        {
          "kind": "line",
          "who": "kunle",
          "see": "Kunle holding the envelope out, not smiling now.",
          "say": "“Leave before Friday. This is double what he paid.”",
          "scene": "He holds it out. No smile."
        },
        {
          "kind": "beat",
          "who": "amaka",
          "see": "Amaka looking at the envelope, then at the lit house behind.",
          "say": "She thinks of her mother's stall. Rent.",
          "scene": "Her eyes. The lit house."
        },
        {
          "kind": "beat",
          "who": "kunle",
          "see": "Kunle leaning closer, voice low.",
          "say": "“Or stay, and I show them your father's file.”",
          "scene": "He leans closer. A whisper."
        },
        {
          "kind": "cliff",
          "see": "Close on the white envelope in Kunle's hand, Amaka's hand reaching.",
          "say": "The envelope waits. Her hand moves toward it.",
          "scene": "The envelope. Her hand."
        },
        {
          "kind": "choice",
          "see": "Close on the envelope, half in shadow.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "message"
      },
      "choice": {
        "question": "Does Amaka take the second envelope?",
        "options": [
          {
            "word": "TAKE",
            "label": "Take the money"
          },
          {
            "word": "REFUSE",
            "label": "Refuse the money"
          }
        ]
      },
      "branches": {
        "TAKE": "Amaka takes it. Kunle smiles. She walks back to the house with the envelope inside her dress.",
        "REFUSE": "Amaka pushes it back. Kunle laughs. 'Then you'll need a ring.' He drops the envelope in the hedge."
      },
      "slots": [
        {
          "key": "portrait",
          "object": "the late father's portrait through the lit window",
          "slide": 4,
          "house": "Noir Director Editorial"
        },
        {
          "key": "phone",
          "object": "Amaka's phone lighting up in her pocket, a message from her mother",
          "slide": 6,
          "house": "Instagram GIF Maker"
        }
      ],
      "alux": {
        "product": "Instagram GIF Maker",
        "where": "Amaka's phone: a live photo of her mother's stall on her lock screen, slide 6"
      }
    },
    {
      "n": 4,
      "after": "*.HIDE",
      "title": "The Offer",
      "slides": [
        {
          "kind": "hook",
          "see": "Designed hook: a garden bench under a frangipani tree, a white envelope on the wood.",
          "say": "The story so far: Femi hid the truth. He said the ring is being sized. Then Kunle offers the waitress an envelope."
        },
        {
          "kind": "cover",
          "see": "Cover: the Coker garden at dusk, a white envelope on a bench.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Thursday evening. The Coker garden. Frangipani in the dark.",
          "say": "Thursday evening. The Coker garden.",
          "scene": "A garden bench. One lamp."
        },
        {
          "kind": "beat",
          "who": "kunle",
          "see": "Kunle stepping out from behind the hedge, envelope in hand.",
          "say": "Kunle steps out of the dark. An envelope.",
          "scene": "From the hedge, an envelope."
        },
        {
          "kind": "line",
          "who": "kunle",
          "see": "Kunle holding the envelope out, not smiling now.",
          "say": "“Leave before Friday. This is double what he paid.”",
          "scene": "He holds it out. No smile."
        },
        {
          "kind": "beat",
          "who": "amaka",
          "see": "Amaka looking at the envelope, then at the lit house behind.",
          "say": "She thinks of her mother's stall. Rent.",
          "scene": "Her eyes. The lit house."
        },
        {
          "kind": "beat",
          "who": "kunle",
          "see": "Kunle leaning closer, voice low.",
          "say": "“Or stay, and I show them your father's file.”",
          "scene": "He leans closer. A whisper."
        },
        {
          "kind": "cliff",
          "see": "Close on the white envelope in Kunle's hand, Amaka's hand reaching.",
          "say": "The envelope waits. Her hand moves toward it.",
          "scene": "The envelope. Her hand."
        },
        {
          "kind": "choice",
          "see": "Close on the envelope, half in shadow.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "message"
      },
      "choice": {
        "question": "Does Amaka take the second envelope?",
        "options": [
          {
            "word": "TAKE",
            "label": "Take the money"
          },
          {
            "word": "REFUSE",
            "label": "Refuse the money"
          }
        ]
      },
      "branches": {
        "TAKE": "Amaka takes it. Kunle smiles. She walks back to the house with the envelope inside her dress.",
        "REFUSE": "Amaka pushes it back. Kunle laughs. 'Then you'll need a ring.' He drops the envelope in the hedge."
      },
      "slots": [
        {
          "key": "portrait",
          "object": "the late father's portrait through the lit window",
          "slide": 4,
          "house": "Noir Director Editorial"
        },
        {
          "key": "phone",
          "object": "Amaka's phone lighting up in her pocket, a message from her mother",
          "slide": 6,
          "house": "Instagram GIF Maker"
        }
      ],
      "alux": {
        "product": "Instagram GIF Maker",
        "where": "Amaka's phone: a live photo of her mother's stall on her lock screen, slide 6"
      }
    },
    {
      "n": 5,
      "after": "*.TAKE",
      "title": "Friday Lunch",
      "slides": [
        {
          "kind": "hook",
          "see": "Designed hook: a long dining table set for lunch, a white envelope under a napkin, a letter in an old woman's hand.",
          "say": "The story so far: the waitress took Kunle's envelope. It is in her bag. Now it is Friday lunch. Her mother arrives with a letter."
        },
        {
          "kind": "cover",
          "see": "Cover: the Coker dining room, every chair full but one, a letter on the table.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Friday, 1 p.m. The Coker dining room. Every chair is full.",
          "say": "Friday, 1 p.m. The Coker dining room.",
          "scene": "Full table. One empty chair."
        },
        {
          "kind": "beat",
          "who": "funmilayo",
          "see": "Funmilayo standing at the head, glass raised.",
          "say": "“The engagement will be announced tonight.”",
          "scene": "She stands. A glass raised."
        },
        {
          "kind": "beat",
          "who": "amaka",
          "see": "Amaka's hand on her bag under the table, the envelope inside.",
          "say": "Amaka's hand stays on her bag. The envelope is heavy.",
          "scene": "Her hand on the bag."
        },
        {
          "kind": "beat",
          "who": "nkechi",
          "see": "The dining room door opening; Nkechi in her market wrapper, a letter in her hand.",
          "say": "The door opens. Her mother walks in with a letter.",
          "scene": "The door. A market wrapper."
        },
        {
          "kind": "line",
          "who": "nkechi",
          "see": "Nkechi holding the letter up, looking at Funmilayo.",
          "say": "“Tell them what you did to my husband.”",
          "scene": "She holds up the letter."
        },
        {
          "kind": "cliff",
          "see": "Funmilayo's glass lowering, her eyes on the letter.",
          "say": "The mother's glass lowers. She knows the handwriting.",
          "scene": "The glass lowers. She knows."
        },
        {
          "kind": "choice",
          "see": "Close on the letter in Nkechi's hand, the table silent.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "reveal"
      },
      "choice": {
        "question": "Does Amaka expose the Cokers or spare them?",
        "options": [
          {
            "word": "EXPOSE",
            "label": "Read the letter aloud"
          },
          {
            "word": "SPARE",
            "label": "Take the letter back"
          }
        ]
      },
      "branches": {
        "EXPOSE": "Amaka reads it aloud. The room learns everything: the fraud, the prison, the debt. Kunle smiles.",
        "SPARE": "Amaka takes the letter and puts it in her bag. 'Not today.' Her mother sits down, shaking."
      },
      "slots": [
        {
          "key": "portrait",
          "object": "the late father's portrait above the sideboard",
          "slide": 4,
          "house": "Noir Director Editorial"
        },
        {
          "key": "phone",
          "object": "Nkechi's phone in her hand, a faded photo of her husband",
          "slide": 6,
          "house": "The Gear Equalizer — Pro Studio Upgrade"
        }
      ],
      "alux": {
        "product": "The Gear Equalizer — Pro Studio Upgrade",
        "where": "Nkechi's faded photo of her late husband on her phone, relit as she walks in, slide 6",
        "word": "LIGHT",
        "line": "Comment LIGHT and we'll relight an old photo for you."
      }
    },
    {
      "n": 5,
      "after": "*.REFUSE",
      "title": "Friday Lunch",
      "slides": [
        {
          "kind": "hook",
          "see": "Designed hook: a long dining table set for lunch, a white envelope under a napkin, a letter in an old woman's hand.",
          "say": "The story so far: the waitress refused Kunle's envelope. She stayed. Now it is Friday lunch. Her mother arrives with a letter."
        },
        {
          "kind": "cover",
          "see": "Cover: the Coker dining room, every chair full but one, a letter on the table.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Friday, 1 p.m. The Coker dining room. Every chair is full.",
          "say": "Friday, 1 p.m. The Coker dining room.",
          "scene": "Full table. One empty chair."
        },
        {
          "kind": "beat",
          "who": "funmilayo",
          "see": "Funmilayo standing at the head, glass raised.",
          "say": "“The engagement will be announced tonight.”",
          "scene": "She stands. A glass raised."
        },
        {
          "kind": "beat",
          "who": "amaka",
          "see": "Amaka's hands folded on the table, no bag.",
          "say": "Amaka has no envelope now. Only her hands.",
          "scene": "Her hands, folded."
        },
        {
          "kind": "beat",
          "who": "nkechi",
          "see": "The dining room door opening; Nkechi in her market wrapper, a letter in her hand.",
          "say": "The door opens. Her mother walks in with a letter.",
          "scene": "The door. A market wrapper."
        },
        {
          "kind": "line",
          "who": "nkechi",
          "see": "Nkechi holding the letter up, looking at Funmilayo.",
          "say": "“Tell them what you did to my husband.”",
          "scene": "She holds up the letter."
        },
        {
          "kind": "cliff",
          "see": "Funmilayo's glass lowering, her eyes on the letter.",
          "say": "The mother's glass lowers. She knows the handwriting.",
          "scene": "The glass lowers. She knows."
        },
        {
          "kind": "choice",
          "see": "Close on the letter in Nkechi's hand, the table silent.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "reveal"
      },
      "choice": {
        "question": "Does Amaka expose the Cokers or spare them?",
        "options": [
          {
            "word": "EXPOSE",
            "label": "Read the letter aloud"
          },
          {
            "word": "SPARE",
            "label": "Take the letter back"
          }
        ]
      },
      "branches": {
        "EXPOSE": "Amaka reads it aloud. The room learns everything: the fraud, the prison, the debt. Kunle smiles.",
        "SPARE": "Amaka takes the letter and puts it in her bag. 'Not today.' Her mother sits down, shaking."
      },
      "slots": [
        {
          "key": "portrait",
          "object": "the late father's portrait above the sideboard",
          "slide": 4,
          "house": "Noir Director Editorial"
        },
        {
          "key": "phone",
          "object": "Nkechi's phone in her hand, a faded photo of her husband",
          "slide": 6,
          "house": "The Gear Equalizer — Pro Studio Upgrade"
        }
      ],
      "alux": {
        "product": "The Gear Equalizer — Pro Studio Upgrade",
        "where": "Nkechi's faded photo of her late husband on her phone, relit as she walks in, slide 6",
        "word": "LIGHT",
        "line": "Comment LIGHT and we'll relight an old photo for you."
      }
    },
    {
      "n": 6,
      "after": "*.EXPOSE",
      "title": "The Letter",
      "finale": true,
      "slides": [
        {
          "kind": "hook",
          "see": "Designed hook: the Coker dining room after lunch, chairs pushed back, one letter on the table, a lighter beside it.",
          "say": "The story so far: the waitress read the letter. The Cokers were exposed. Now the house is quiet. The letter is still in her hand."
        },
        {
          "kind": "cover",
          "see": "Cover: the Coker dining room, a letter and a lighter on the white cloth.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Friday, 4 p.m. The Coker dining room. The plates are cleared.",
          "say": "Friday, 4 p.m. The Coker dining room.",
          "scene": "Empty plates. One letter."
        },
        {
          "kind": "beat",
          "who": "femi",
          "see": "Femi at the window, not looking at her.",
          "say": "Femi says nothing. The shares are gone.",
          "scene": "At the window, his back turned."
        },
        {
          "kind": "line",
          "who": "amaka",
          "see": "Amaka holding the letter, not opening it.",
          "say": "“I didn't do it to hurt you.”",
          "scene": "She holds the letter. A whisper."
        },
        {
          "kind": "beat",
          "who": "funmilayo",
          "see": "Funmilayo in the doorway, her gele untied.",
          "say": "The mother appears. She has something to say.",
          "scene": "In the doorway, the gele untied."
        },
        {
          "kind": "beat",
          "who": "funmilayo",
          "see": "Funmilayo close to Amaka, voice low.",
          "say": "“I wrote the letter that jailed your father.”",
          "scene": "She confesses. Her voice breaks."
        },
        {
          "kind": "cliff",
          "see": "Close on the letter in Amaka's hand, a lighter in the other.",
          "say": "The letter is still sealed. So is her mother's truth.",
          "scene": "The letter. A lighter."
        },
        {
          "kind": "choice",
          "see": "Close on the letter and the lighter on the table.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "message"
      },
      "choice": {
        "question": "Does Amaka open her father's letter?",
        "options": [
          {
            "word": "OPEN",
            "label": "Open the letter"
          },
          {
            "word": "BURN",
            "label": "Burn the letter"
          }
        ]
      },
      "branches": {
        "OPEN": "Season two: the letter names a second beneficiary — Femi's father. The two families were never enemies.",
        "BURN": "Season two: Amaka burns it. The truth goes up in smoke. Kunle finds the ashes and smiles."
      },
      "slots": [
        {
          "key": "portrait",
          "object": "the Coker family portrait in the hall, now with an empty space",
          "slide": 4,
          "house": "Noir Director Editorial"
        },
        {
          "key": "phone",
          "object": "Amaka's phone on the garden table, a photo of her mother's stall",
          "slide": 3,
          "house": "Instagram GIF Maker"
        }
      ],
      "alux": {
        "product": "Noir Director Editorial",
        "where": "the family portrait in the hall, with one new frame waiting, slide 4"
      }
    },
    {
      "n": 6,
      "after": "*.SPARE",
      "title": "The Letter",
      "finale": true,
      "slides": [
        {
          "kind": "hook",
          "see": "Designed hook: the Coker garden after lunch, a letter on a bench, a lighter beside it.",
          "say": "The story so far: the waitress spared the Cokers. The letter stayed sealed. The mother gave her blessing. Now the engagement is real."
        },
        {
          "kind": "cover",
          "see": "Cover: the Coker garden, a letter and a lighter on a bench.",
          "say": ""
        },
        {
          "kind": "time",
          "see": "Friday, 4 p.m. The Coker garden. The lunch is over.",
          "say": "Friday, 4 p.m. The Coker garden.",
          "scene": "The garden. A folding chair."
        },
        {
          "kind": "beat",
          "who": "femi",
          "see": "Femi beside her on the bench, their hands close.",
          "say": "Femi takes her hand. The ring is real now.",
          "scene": "Hands close. A ring."
        },
        {
          "kind": "line",
          "who": "amaka",
          "see": "Amaka looking at the letter in her lap.",
          "say": "“I have a letter from my father.”",
          "scene": "The letter in her lap."
        },
        {
          "kind": "beat",
          "who": "funmilayo",
          "see": "Funmilayo passing by, stopping.",
          "say": "The mother stops. “Open it when you're ready.”",
          "scene": "She stops. She does not look."
        },
        {
          "kind": "beat",
          "who": "bisola",
          "see": "Bisola appears with a lighter, a small smile.",
          "say": "Bisola brings a lighter. “Or burn it.”",
          "scene": "A lighter, held out."
        },
        {
          "kind": "cliff",
          "see": "Close on the letter in Amaka's lap, the lighter in Bisola's hand.",
          "say": "The letter is still sealed. The choice is hers.",
          "scene": "The letter. The lighter."
        },
        {
          "kind": "choice",
          "see": "Close on the letter and the lighter on the bench.",
          "say": ""
        }
      ],
      "cliff": {
        "type": "message"
      },
      "choice": {
        "question": "Does Amaka open her father's letter?",
        "options": [
          {
            "word": "OPEN",
            "label": "Open the letter"
          },
          {
            "word": "BURN",
            "label": "Burn the letter"
          }
        ]
      },
      "branches": {
        "OPEN": "Season two: the letter names a second beneficiary — Femi's father. The two families were never enemies.",
        "BURN": "Season two: Amaka burns it. The truth goes up in smoke. Kunle finds the ashes and smiles."
      },
      "slots": [
        {
          "key": "portrait",
          "object": "the Coker family portrait in the hall, now with an empty space",
          "slide": 4,
          "house": "Noir Director Editorial"
        },
        {
          "key": "phone",
          "object": "Amaka's phone on the garden table, a photo of her mother's stall",
          "slide": 3,
          "house": "Instagram GIF Maker"
        }
      ],
      "alux": {
        "product": "Noir Director Editorial",
        "where": "the family portrait in the hall, with one new frame waiting, slide 4"
      }
    }
  ]
};
