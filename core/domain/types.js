// @ts-check
/**
 * 全專案共用的型別契約。這個檔案只有 typedef，沒有任何執行邏輯。
 *
 * 用 JSDoc 而不是 .ts，是因為專案刻意零建置：出貨的就是這些 .js 檔本身，
 * `npx tsc --noEmit` 只在開發期檢查、永不產出檔案。
 */

/** @typedef {import('../rng/rng.js').Rng} Rng */
/** @typedef {import('../rng/rng.js').RngKey} RngKey */
/** @typedef {import('../odds/odds.js').Odds} Odds */
/** @typedef {import('../odds/odds.js').Modifier} Modifier */

// ─── 球員 ────────────────────────────────────────────────────────────────

/** @typedef {string} PlayerId 例：'P07'。池內穩定序號，永不重用。 */

/**
 * @typedef {'SP'|'RP'|'CP'|'C'|'1B'|'2B'|'3B'|'SS'|'LF'|'CF'|'RF'|'DH'} Position
 */

/** @typedef {'L'|'R'|'S'} Handed */
/** @typedef {'MLB'|'MiLB'|'NPB'|'KBO'|'CPBL'|'AMATEUR'} LeagueTag */

/**
 * @typedef {object} BatRatings
 * @property {number} contact 擊球能力
 * @property {number} power   長打力
 * @property {number} eye     選球
 * @property {number} speed   速度
 * @property {number} field   守備範圍
 * @property {number} arm     肩力
 */

/**
 * @typedef {object} PitRatings
 * @property {number} velo    球速
 * @property {number} control 控球
 * @property {number} stuff   球質
 * @property {number} stamina 續航
 */

/**
 * @typedef {object} Ratings
 * @property {BatRatings} bat
 * @property {PitRatings} pit
 */

/**
 * @typedef {object} GrowthProfile
 * @property {number} peakAge     顛峰年齡 26..30
 * @property {number} growthRate  成長速度 0.6..1.4
 * @property {number} declineRate 衰退速度 0.6..1.4
 * @property {number} durability  耐用度，影響受傷機率
 */

/**
 * @typedef {object} Workload
 * @property {number} pitchesThisGame 本場球數
 * @property {number} pitchesInEvent  本賽會累積球數
 * @property {number} daysRest        休息天數
 */

/**
 * @typedef {object} Condition
 * @property {number} fatigue 疲勞 0..100，賽會內累積
 * @property {number} form    手感 -10..+10
 * @property {?{code:string, gamesOut:number, severity:1|2|3}} injury
 * @property {Workload} workload
 */

/**
 * @typedef {object} Player
 * @property {PlayerId} id
 * @property {string} name
 * @property {number} number 背號
 * @property {number} age
 * @property {Handed} bats
 * @property {'L'|'R'} throws
 * @property {Position} primary
 * @property {readonly Position[]} secondary
 * @property {LeagueTag} league
 * @property {string} club          虛構球團名
 * @property {string} archetypeId
 * @property {string} archetypeLabel 例：'旅美左投'
 * @property {Ratings} ratings
 * @property {Ratings} potential    隱藏上限；由「識人」決定揭露精度
 * @property {GrowthProfile} growth
 * @property {Condition} condition
 * @property {readonly string[]} traits
 * @property {number} loyalty  0..100 應召意願
 * @property {number} fame     0..100 輿論權重
 */

// ─── 教頭 ────────────────────────────────────────────────────────────────

/**
 * @typedef {object} CoachAttr
 * @property {number} bullpen       用兵
 * @property {number} scouting      識人
 * @property {number} communication 溝通
 * @property {number} conditioning  體能管理
 * @property {number} intel         情蒐
 */

/** @typedef {'bullpen'|'scouting'|'communication'|'conditioning'|'intel'} CoachAttrKey */

/**
 * @typedef {object} Meters
 * @property {number} publicApproval 民調 0..100
 * @property {number} assocTrust     協會信任 0..100
 * @property {number} playerMorale   球員士氣 0..100
 */

/** @typedef {'publicApproval'|'assocTrust'|'playerMorale'} MeterKey */

/**
 * @typedef {object} Coach
 * @property {string} name
 * @property {CoachAttr} attrs
 * @property {CoachAttr} caps 隱藏上限，UI 顯示「用兵 26/49」
 * @property {number} unspentPoints
 * @property {Meters} meters
 * @property {readonly string[]} flags 敘事旗標，事件卡條件用
 */

// ─── 名單與賽事 ──────────────────────────────────────────────────────────

/** @typedef {'SP1'|'SP2'|'SP3'|'RP'|'CP'|'LINEUP'|'BENCH'} RosterSlot */

/**
 * @typedef {object} Roster
 * @property {readonly PlayerId[]} members  28 人
 * @property {readonly PlayerId[]} lineup   打序 1..9
 * @property {Record<PlayerId, Position>} assigned 該球員在這份名單實際守的位置
 * @property {readonly PlayerId[]} rotation 先發輪值
 * @property {readonly PlayerId[]} bullpen  牛棚順序（最後一位為終結者）
 * @property {readonly {id:PlayerId, reason:string}[]} declined 徵召失敗
 */

/**
 * @typedef {object} NationDef
 * @property {string} code 例：'JPN'
 * @property {string} name 例：'日本'
 * @property {number} strength 0..100 整體實力
 * @property {'ASIA'|'EURO_OCE'|'AMERICAS'} region
 */

/**
 * @typedef {object} StageDef
 * @property {string} id
 * @property {string} name      例：'開幕循環賽'
 * @property {string} venue     例：'臺北大巨蛋'
 * @property {readonly string[]} opponents 對手國家代號，一場一個
 * @property {number} minWins   晉級所需最低勝場；未達即淘汰
 * @property {string} eliminatedRank 未晉級時的最終名次標籤
 * @property {number} eliminatedRankNum 未晉級時的名次數字（供門票判定）
 */

/**
 * @typedef {object} TournamentDef
 * @property {string} id
 * @property {number} year
 * @property {string} name
 * @property {string} subtitle
 * @property {readonly StageDef[]} stages
 * @property {number} pointsPerWin
 * @property {readonly {rank:number, label:string, points:number}[]} rankRewards
 */

/**
 * @typedef {object} GameRef
 * @property {number} index
 * @property {string} stageId
 * @property {string} opponent 國家代號
 */

/**
 * @typedef {object} GameResult
 * @property {number} index
 * @property {string} stageId
 * @property {string} opponent
 * @property {number} runsFor
 * @property {number} runsAgainst
 * @property {boolean} win
 * @property {readonly string[]} highlights
 * @property {?PlayerId} mvp
 * @property {Record<string, number>} pitchCounts 我方每位投手本場的球數
 * @property {number} moraleDelta 場中決策累積的士氣變化
 */

/**
 * @typedef {object} TournamentState
 * @property {string} defId
 * @property {readonly GameRef[]} schedule
 * @property {number} gameIndex
 * @property {readonly GameResult[]} results
 * @property {number} stageIndex
 * @property {boolean} eliminated
 */

// ─── 比賽模擬 ────────────────────────────────────────────────────────────

/**
 * @typedef {object} GameSnapshot
 * @property {number} inning
 * @property {'top'|'bot'} half
 * @property {number} outs
 * @property {[boolean, boolean, boolean]} bases 一二三壘
 * @property {number} runsUs
 * @property {number} runsThem
 * @property {?PlayerId} pitcher
 * @property {?PlayerId} batter
 * @property {number} pitchCount 目前投手本場球數
 */

/**
 * @typedef {'K'|'BB'|'HBP'|'OUT_G'|'OUT_F'|'1B'|'2B'|'3B'|'HR'|'ERR'} PaOutcome
 */

/**
 * @typedef {object} DecisionOption
 * @property {string} id
 * @property {string} label
 * @property {?Odds} odds
 * @property {readonly string[]} preview 例：['成功：得分機率 +18%']
 * @property {?string} lockedReason 有值代表不可選（附原因）
 */

/**
 * @typedef {'PITCHING_CHANGE'|'PINCH_HIT'|'BUNT'|'IBB'|'SHIFT'|'STEAL'|'EVENT_CARD'|'ALLOCATE'|'ROSTER'|'PREGAME'} DecisionKind
 */

/**
 * @typedef {object} DecisionPrompt
 * @property {RngKey} rngKey 同時是存檔錨點
 * @property {DecisionKind} kind
 * @property {string} templateId
 * @property {string} title
 * @property {string} body
 * @property {?GameSnapshot} context
 * @property {readonly DecisionOption[]} options
 * @property {?PromptExtra} extra UI 需要的結構化資料（點數、可選投手…）
 */

/**
 * @typedef {object} PromptExtra
 * @property {number} [points] 這次可分配的能力點
 * @property {readonly {id:string, name:string, load:number, overall:number}[]} [starters] 可選先發
 * @property {string} [opponent]
 * @property {string} [venue]
 */

/**
 * @typedef {object} DecisionResponse
 * @property {RngKey} promptKey
 * @property {string} optionId
 */

/**
 * @typedef {{t:'PLAY', narrative:string, snapshot:GameSnapshot, outcome:PaOutcome, runs:number}
 *   | {t:'HALF_END', snapshot:GameSnapshot}
 *   | {t:'DECISION', prompt:DecisionPrompt}
 *   | {t:'SUBSTITUTION', narrative:string}
 *   | {t:'GAME_END', result:GameResult}
 * } SimEvent
 */

/**
 * 生涯層級的事件。SimEvent 會原樣往上傳，另外加上生涯自己的階段與敘事。
 * @typedef {SimEvent
 *   | {t:'PHASE', phase:Phase, title:string, body:string}
 *   | {t:'NARRATIVE', entry:NarrativeEntry}
 *   | {t:'GAME_START', index:number, stageId:string, stageName:string, venue:string, opponent:string, opponentName:string}
 *   | {t:'STATE', state:CareerState}
 *   | {t:'ENDING', ending:{id:string, title:string, text:string}}
 * } CareerEvent
 */

// ─── 內容資料 ────────────────────────────────────────────────────────────

/**
 * @typedef {{pick:'randomPlayer'}
 *   | {pick:'acePitcher'}
 *   | {pick:'worstForm'}
 *   | {pick:'oldestOver', age:number}
 *   | {pick:'currentPitcher'}
 *   | {pick:'currentBatter'}
 * } CastSpec
 */

/** @typedef {number} CastRef cast 陣列的索引 */

/**
 * @typedef {{t:'coachAttr', attr:CoachAttrKey, delta:number}
 *   | {t:'meter', meter:MeterKey, delta:number}
 *   | {t:'points', delta:number}
 *   | {t:'playerRating', target:CastRef, group:'bat'|'pit', key:string, delta:number}
 *   | {t:'playerLoyalty', target:CastRef, delta:number}
 *   | {t:'playerForm', target:CastRef, delta:number}
 *   | {t:'injure', target:CastRef, games:[number, number], severity:1|2|3}
 *   | {t:'flag', add?:readonly string[], remove?:readonly string[]}
 *   | {t:'narrative', text:string}
 * } Effect
 */

/**
 * @typedef {{op:'gte'|'lte', path:string, value:number}
 *   | {op:'hasFlag', flag:string}
 *   | {op:'not', of:Predicate}
 *   | {op:'and'|'or', of:readonly Predicate[]}
 *   | {op:'always'}
 * } Predicate
 */

/**
 * @typedef {object} ModifierRule
 * @property {string} source
 * @property {string} label 支援 {{...}} 模板變數
 * @property {'coachAttr'|'flat'} from
 * @property {CoachAttrKey} [attr]
 * @property {number} points
 */

/**
 * @typedef {object} EventOption
 * @property {string} id
 * @property {string} label
 * @property {number} baseRate 明碼基準成功率
 * @property {readonly ModifierRule[]} [rateMods]
 * @property {readonly Effect[]} onSuccess
 * @property {readonly Effect[]} onFail
 * @property {string} successText
 * @property {string} failText
 */

/**
 * @typedef {object} EventCard
 * @property {string} id
 * @property {number} weight
 * @property {Predicate} [requires]
 * @property {readonly CastSpec[]} cast
 * @property {string} title
 * @property {string} body
 * @property {readonly EventOption[]} options
 */

/**
 * @typedef {object} DecisionTemplateOption
 * @property {string} id
 * @property {string} label
 * @property {number} baseRate
 * @property {readonly ModifierRule[]} [rateMods]
 * @property {readonly string[]} preview
 * @property {'PULL_PITCHER'|'BUNT'|'IBB'|'SHIFT'|'PINCH_HIT'|'STEAL'|'STAY'} action
 * @property {string} successText
 * @property {string} failText
 */

/**
 * @typedef {object} DecisionTemplate
 * @property {string} id
 * @property {DecisionKind} kind
 * @property {string} title
 * @property {string} body
 * @property {number} priority 同時符合時，數字大的優先
 * @property {readonly DecisionTemplateOption[]} options
 */

/**
 * @typedef {object} Archetype
 * @property {string} id
 * @property {string} label      例：'旅美左投'
 * @property {LeagueTag} league
 * @property {readonly Position[]} positions
 * @property {[number, number]} ageRange
 * @property {Partial<Record<string, [number, number]>>} batMean 各項 [mean, sd]
 * @property {Partial<Record<string, [number, number]>>} pitMean
 * @property {number} callupDifficulty 徵召難度 0..100
 * @property {readonly string[]} clubs
 * @property {number} weight
 */

/**
 * @typedef {object} NameTables
 * @property {readonly {s:string, w:number}[]} surnames
 * @property {readonly string[]} givenChars
 */

/**
 * @typedef {object} ContentPack
 * @property {string} id
 * @property {string} version
 * @property {readonly TournamentDef[]} tournaments
 * @property {readonly NationDef[]} nations
 * @property {readonly Archetype[]} archetypes
 * @property {NameTables} names
 * @property {readonly DecisionTemplate[]} decisionTemplates
 * @property {readonly EventCard[]} eventCards
 * @property {readonly string[]} traits
 */

// ─── 生涯狀態 ────────────────────────────────────────────────────────────

/**
 * @typedef {'INIT'|'ROSTER'|'TOURNAMENT'|'REVIEW'|'ALLOCATE'|'ENDED'} Phase
 */

/**
 * @typedef {object} NarrativeEntry
 * @property {string} kind   例：'event'|'play'|'result'
 * @property {string} title
 * @property {string} text
 * @property {readonly string[]} deltas 例：['力量 +2']
 * @property {'good'|'bad'|'neutral'} tone
 */

/**
 * @typedef {object} CareerState
 * @property {1} schema
 * @property {number} seed
 * @property {string} seedCode
 * @property {string} packVersion
 * @property {number} year
 * @property {Phase} phase
 * @property {Coach} coach
 * @property {Record<PlayerId, Player>} players
 * @property {readonly PlayerId[]} poolOrder 球員池唯一權威的迭代順序
 * @property {?Roster} roster
 * @property {?TournamentState} tournament
 * @property {number} seq 已消耗的決策序號
 * @property {?DecisionPrompt} pending
 * @property {readonly NarrativeEntry[]} log
 * @property {?{id:string, title:string, text:string}} ending
 */

export {};
