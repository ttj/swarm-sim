# Drone Swarm Defense Strategy Analysis

## Methodology

Adversarial strategy search across 30+ blue defense configurations tested against 4 red attack scenarios (500–2,000 Shahed-136 drones, with and without GPS jamming). Each configuration was evaluated via Monte Carlo simulation (20 runs per config) using the headless simulation engine. Strategies ranged from $18K (decoys only) to $32M (layered EW+DE+interceptors). All Shahed-136 drones are GPS-guided ($30K each, 150 km/h, 2,500 km range).

### Attack Scenarios Tested

| Scenario | Drones | GPS Jamming | Red Budget | Strategy |
|----------|--------|-------------|------------|----------|
| A | 500 Shaheds | No | $15M | Saturation rush |
| B | 500 Shaheds | Yes | $15M | Saturation rush |
| C | 1,000 Shaheds | No | $30M | Multi-axis |
| D | 2,000 Shaheds | Yes | $60M | Feint & strike |

### Defense Configurations Tested (sample)

| Config | Cost | Assets |
|--------|------|--------|
| 50 cheap interceptors | $100K | 50 GPS interceptor drones at Hsinchu |
| 200 interceptors spread | $400K | 50 at each of 4 facilities |
| 6 decoys offshore | $18K | Decoy emitters creating false GPS targets |
| EW jammer Hsinchu | $3M | Single EW jammer at highest-value facility |
| EW blanket (all 4) | $12M | EW jammer at each facility |
| EW + 200 interceptors | $12.4M | EW blanket + 200 interceptors spread |
| EW + interceptors + DE | $32.4M | EW blanket + 200 interceptors + directed energy at top 2 |
| 60 auto-nav interceptors | $900K | EW-resistant interceptors at top 2 facilities |
| Fortress Hsinchu | $13.4M | All assets concentrated on HQ |

---

## Key Findings

### Strategy 1: EW Blanket is the Dominant Cheap Strategy

**$12M for 4 EW jammers → 100% facility survival against 500 GPS-guided Shaheds**

This is the single most surprising result. Four EW jammers ($3M each) with *zero interceptor drones* achieve 100% facility survival against 500 Shaheds at $0 marginal cost per engagement. Adding 200 interceptor drones ($400K) provides *no additional benefit*. EW kills 492/500 drones.

The insight: against GPS-guided swarms, jamming the guidance system is more cost-effective than kinetic interception by orders of magnitude. EW systems are reusable with unlimited engagements, while each interceptor drone is consumed on use.

| Defense | Cost | P(≥3 safe) | Avg Kills | CER |
|---------|------|------------|-----------|-----|
| EW blanket only | $12M | 100% | 492/500 | $0/kill |
| EW + 200 interceptors | $12.4M | 100% | 492/500 | $0/kill |
| 200 interceptors only | $400K | 0% | ~0 | N/A |

**Implication**: Against current-generation GPS-guided drone swarms, the optimal first investment is electronic warfare, not kinetic interceptors.

---

### Strategy 2: GPS Jamming is a Double-Edged Sword That Backfires on Red

**Red's own GPS jamming makes blue's EW MORE effective**

When red activates GPS jamming to disrupt blue's GPS-guided interceptors, it simultaneously disrupts its own GPS-guided Shaheds — making them *more* vulnerable to blue's EW jammers. Under GPS jamming, a single $3M EW jammer at Hsinchu achieves 100% protection of the most valuable facility.

| Condition | Single EW at Hsinchu | EW Blanket |
|-----------|---------------------|------------|
| No GPS jamming | Protects Hsinchu, others fall | 100% survival |
| GPS jamming active | 100% Hsinchu protection | 100% survival, 500/500 kills |

**Implication**: Red faces a dilemma. GPS jamming degrades blue's cheap interceptors but simultaneously strengthens blue's EW defense. The only counter is switching to autonomous vision-navigation drones — which cost 2–5x more ($50–100K each), making the attack itself cost-prohibitive.

---

### Strategy 3: Interceptor Drones Alone Are Ineffective (Saturation Defeats Kinetic)

**200 interceptor drones ($400K) achieve 0% survival against 500 Shaheds**

Pure kinetic defense fails catastrophically against swarms. The saturation ratio (500:200 = 2.5:1) means most drones get through despite the interceptors having 70% per-engagement kill probability.

The math:
- 200 interceptors at 70% pkill × saturation modifier (200/500 = 0.4) = effective pkill ~28%
- ~140 drones destroyed, ~360 reach targets
- Each facility has 4–5 HP → all facilities destroyed

To achieve kinetic-only survival, blue would need ~800+ interceptors ($1.6M) — and that only works if red doesn't increase drone count.

| Interceptor Count | Cost | vs 500 Shaheds | vs 1,000 Shaheds |
|-------------------|------|----------------|------------------|
| 50 | $100K | 0% survival | 0% |
| 200 | $400K | 0% survival | 0% |
| 200 + EW blanket | $12.4M | 100% survival | 30% |

**Implication**: Kinetic-only defense requires numerical superiority over the swarm, which is economically infeasible. EW provides the "force multiplier" that makes smaller interceptor forces viable.

---

### Strategy 4: Layered EW+DE Scales to 2,000 Drones

**EW blanket + 2 directed energy systems ($32M) → 95% survival against 2,000 Shaheds**

At the 2,000-drone scale with GPS jamming, pure EW drops to ~30% survival (enough drones overwhelm the jamming). But adding directed energy at the top-2 facilities as a close-in last resort catches the 5–10% that penetrate EW.

| Defense | Cost | vs 500 | vs 1,000 | vs 2,000+jam |
|---------|------|--------|----------|--------------|
| EW blanket | $12M | 100% | 30% | 30% |
| EW + DE top 2 | $32M | 100% | 60% | 95% |
| Full spectrum ($5B) | $5B | 100% | 100% | ~100% |

The 2-layer approach (EW outer ring at 15km, DE inner ring at 2km) is **150x cheaper** than the $5B full-spectrum defense and achieves nearly the same result.

**Implication**: The marginal value of defense spending drops sharply after the EW+DE combination. Spending from $32M to $5B buys only 5 percentage points of improvement (95% → ~100%).

---

### Strategy 5: The "Sacrifice Three, Save One" Fortress

**Single EW jammer at Hsinchu ($3M) → 100% protection of HQ under GPS jamming**

When budget is severely constrained, concentrating all defense on the highest-value target (Hsinchu, value=100) while accepting loss of the other three facilities (combined value=230) is mathematically optimal per dollar spent.

| Strategy | Cost | Hsinchu | Tainan | Kaohsiung | Taichung |
|----------|------|---------|--------|-----------|----------|
| Spread defense equally | $12M | Protected | Protected | Protected | Protected |
| Fortress Hsinchu | $3M | Protected | Lost | Lost | Lost |
| No defense | $0 | Lost | Lost | Lost | Lost |

Under GPS jamming, the fortress approach is even stronger: red's jamming helps blue's single EW jammer.

**Implication**: When budget constraints are binding, the rational strategy is to explicitly sacrifice lower-value assets rather than spread defense thin. This is emotionally counterintuitive — deliberately leaving facilities undefended — but maximizes expected value saved per dollar spent.

---

## Meta-Insight: The Paradigm Shift

The core finding across all scenarios is that **electronic warfare dominates kinetic interception against GPS-guided drone swarms**. This inverts conventional defense procurement logic:

| Approach | Cost per engagement | Reusable? | Effective range | Scales with swarm size? |
|----------|-------------------|-----------|-----------------|------------------------|
| Interceptor drone | $2,000 | No (consumed) | 20 km | No — saturated at ~2.5:1 ratio |
| EW jammer | $0 | Yes | 15 km | Yes — jams all GPS drones in range |
| Directed energy | $10 | Yes | 2 km | Partially — rate-limited |
| Patriot missile | $4,000,000 | No | 60 km | No — absurd cost ratio |

The break-even only shifts toward kinetic defense when adversaries deploy **autonomous vision-navigation drones** ($50–100K each). This makes the attack itself 2–5x more expensive, creating a different kind of deterrence: forcing the attacker to spend more doesn't require the defender to spend more.

### The Attacker's Dilemma

Red faces three bad options:

1. **GPS-guided swarm** ($30K/drone): Cheap but neutralized by $12M in EW jammers
2. **GPS-guided + GPS jamming**: Backfires — helps blue's EW while hurting red's own guidance
3. **Autonomous vision-nav** ($75K/drone): EW-resistant but 2.5x cost, making the attack economically questionable

The optimal blue investment is therefore: **EW first, DE second, interceptors third** — exactly the opposite of intuitive kinetic-first thinking.

---

## V2 Analysis: The Saturation Ladder (March 2026)

V2 expanded the analysis to 40+ defense configurations against 7 attack types including autonomous vision-nav drones, fiber-optic guided drones, and Jiutian mothership swarm deployments. The combat model was tuned to produce realistic differentiation (3% interceptor launch rate per tick matching ~30s real-world launch cycles).

### New Systems Modeled

| System | Type | Cost | Key Capability |
|--------|------|------|---------------|
| **Epirus Leonidas HPM** | High-power microwave | $16.5M | Area-denial: single pulse defeats 50+ drones. Works vs fiber-optic AND autonomous. $5/shot. |
| **SkyFall P1-SUN** | Kamikaze interceptor | $1K/unit | Ukraine-proven, 300+ km/h, 3D-printed. Cheapest kinetic option. |
| **Fiber-optic drone** | Attack (EW-immune) | $8K | Immune to ALL RF jamming. Only HPM and kinetic can defeat. |
| **Jiutian sub-munition** | Attack (autonomous) | $5K | Deployed from 16-ton mothership at 15km altitude. GPS-independent. |

### The Saturation Ladder

The single most important finding: **the scale of attack determines which defense works, not the technology of the drones.**

| Attack Scale | Best Defense | Cost | P(≥3 safe) | What Fails |
|-------------|-------------|------|------------|------------|
| 500 drones | Cheap interceptors | $100K | 100% | Nothing — all defenses work |
| 500 + GPS jam | EW blanket | $12M | 100% | Interceptors slightly degraded |
| **1,000 multi-axis** | **HPM at top 2** | **$33M** | **100%** | **EW and interceptors both fail** |
| **2,000 + GPS jam** | **Nothing available** | $66M max | **0%** | **All current defenses overwhelmed** |
| 500 autonomous | Cheap interceptors | $100K | 100% | EW-immunity irrelevant for kinetic |
| 300 fiber-optic | Cheap interceptors | $100K | 100% | EW-immunity irrelevant at this scale |
| 500 Jiutian swarm | Cheap interceptors | $100K | 100% | Mothership delivery doesn't change defense math |

### Strategy 6: HPM is the Dominant Defense Above 500 Drones

**At 1,000+ drone attacks, HPM is the ONLY defense that achieves facility survival.**

EW jammers kill 344 drones (of 1,000) but can't process fast enough. Interceptor squads at 3%/tick are too slow. HPM area-denial pulses defeat all drones within 1km simultaneously, regardless of guidance type.

| Defense vs 1,000 drones | Cost | P(≥3 safe) | Kills |
|------------------------|------|------------|-------|
| EW blanket | $12M | 0% | 344 |
| 200 interceptors | $400K | 0% | 0 |
| **HPM at top 2** | **$33M** | **100%** | **300** |
| HPM + EW | $45M | 100% | 461 |

**Implication**: The optimal defense investment order is now **HPM first, EW second, interceptors third** — a revision of the v1 finding. HPM is more expensive than EW ($16.5M vs $3M) but is the only system that scales to 1,000+ drone attacks.

### Strategy 7: 2,000 Drones is the Defense Ceiling

**No currently modeled defense system can stop 2,000+ coordinated drones.** Even $66M in HPM at all 4 sites + EW blanket achieves 0% facility survival against 2,000 Shaheds with GPS jamming.

This means defense against mass drone attacks above ~1,500 drones requires either:
1. **Pre-emptive strike** — destroy drones before launch (mothership kill, airfield attack)
2. **Attrition campaign** — sustain defense over days, depleting red's stockpile faster than production
3. **Force multiplication** — next-gen HPM with 2x range (Epirus 2026 upgrade), or multiple HPM per site

### Strategy 8: Autonomous Drone EW-Immunity is Overrated

**Autonomous and fiber-optic drones are NOT harder to defend against than GPS drones — at the same scale.**

The v1 analysis feared that switching to autonomous drones ($75K) would neutralize EW defense. The v2 analysis shows this is wrong: kinetic interceptors work against all drone types regardless of guidance. The only advantage of autonomous drones is EW-immunity, which matters only when EW is the primary defense.

The real attacker's dilemma remains cost-based:
- GPS drones ($30K): Cheap, EW-jammable, but overwhelming at scale
- Autonomous ($75K): EW-resistant, but 2.5x cost for the same kinetic effect
- Fiber-optic ($8K): Cheap AND EW-resistant, but short-range (20km) — requires close launch platforms

**The most dangerous attack is not the most technologically advanced — it's the cheapest one at the largest scale.**

### Strategy 9: The Campaign Threshold

Multi-day campaign simulations show that sustained 400 drone/day attacks for 7 days (2,800 total) can overwhelm HPM + EW defenses that handle 1,000 in a single engagement. The difference: daily attacks deplete interceptor stocks while facilities accumulate damage.

| Campaign Scenario | Break Point | Key Factor |
|-------------------|-------------|------------|
| 400/day + EW defense | Day 3-4 | Interceptor stocks exhaust |
| 400/day + HPM defense | Day 5-6 | HPM range limits coverage gaps |
| 1,000/day surge | Day 1-2 | Immediate saturation |

**Implication**: The production rate ratio (red drones/day vs blue interceptors/day) is the ultimate determinant of campaign outcome, not single-engagement technology.

---

## Scenarios Available in Simulator

### Pre-Built Scenarios (14 total)

**Designed scenarios (6):**
1. Probe vs Shoestring ($1M) — 200 Shaheds
2. 500 Shaheds vs EW ($50M)
3. 1K + GPS Jam vs Layered ($500M)
4. 2K + Feint vs Fortress ($1.5B)
5. 3K Attrition vs Full Spectrum ($5B)
6. Quarantine + Missiles + 2K + UUVs ($5B)

**AI-discovered strategies (5):**
7. [AI] EW-Only vs 500 ($12M) — zero interceptors, pure EW
8. [AI] Single EW at Hsinchu ($3M) — sacrifice 3, save 1
9. [AI] EW+DE vs 2K ($32M) — layered soft-kill
10. [AI] 200 Interceptors FAIL ($400K) — saturation defeats kinetic
11. [AI] GPS Jamming BACKFIRES ($12M) — double-edged sword

**Calibration & new threat scenarios (3):**
12. [CAL] Iran-UAE 2026 (2,000 drones) — calibrate to 93-97% intercept
13. [NEW] Jiutian Mothership (500 autonomous) — 5 motherships deploy 100 each
14. [NEW] Fiber-Optic Attack (300 EW-immune) — tests HPM necessity

**Multi-day campaigns (Campaign tab):**
- 7-Day: 400/day vs EW defense
- 7-Day: 400/day vs HPM defense
- 7-Day: 1,000/day surge (overwhelming)

### Running the Analysis

```bash
npm run dev              # Interactive simulator
npx tsx scripts/run-analysis.ts  # Full adversarial search (7 attack types × 40+ defenses)
```

Live demo: https://ttj.github.io/swarm-sim/
