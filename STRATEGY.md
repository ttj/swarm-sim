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

## Scenarios Available in Simulator

These strategies are available as pre-built scenarios in the simulator (marked with [AI] prefix):

1. **[AI] EW-Only vs 500 Shaheds ($12M)** — Zero interceptors, pure EW
2. **[AI] Single EW at Hsinchu vs 500 ($3M)** — Fortress approach, sacrifice 3
3. **[AI] EW+DE Layered vs 2K Drones ($32M)** — Optimal layered defense
4. **[AI] 200 Interceptors FAIL vs 500 ($400K)** — Demonstrates saturation failure
5. **[AI] GPS Jamming BACKFIRES on Red ($12M)** — Double-edged sword paradox

Run `npm run dev` and select these from the Scenario tab to simulate them visually.

Run `npx tsx scripts/run-analysis.ts` for the full adversarial search across all attack levels.
