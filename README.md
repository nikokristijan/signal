# BOMBA — dnevna hrvatska igra riječi

> **Napomena o povijesti repozitorija:** repozitorij se još zove `signal` jer je na njega povezan Vercel. Do commita „Bomba" ovdje je bila igra SIGNAL (dnevna igra s uvećanim fotografijama). Njezin zadnji commit je `fbc4da5`; vrati je s `git checkout fbc4da5` (ili `git revert` ovog commita).


Na bombi je **slog** od 2–3 slova (npr. `KRA`). Upiši riječ koja ga sadrži (*kravata*, *ukrasti*, *ukrao*…) prije nego bomba eksplodira.
Svatko igra sam, svaki dan svi dobiju **isti niz slogova**, a rezultati se uspoređuju s prijateljima kao u Wordleu. Bez lobbyja, bez igre uživo.

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Supabase · Vercel. Cijelo sučelje je na hrvatskom, mobile-first.

## Kako se igra

* Točna riječ = novi slog i tajmer se vraća. Kriva riječ ne radi ništa (crveni shake + razlog: *Nema sloga*, *Nema u rječniku*, *Već iskorišteno*).
* **Tajmer** kreće od 10 s i sa svakom točnom riječi se skraćuje za 0,25 s, do najmanje 3 s.
* Kad tajmer istekne, bomba eksplodira: gubiš život i dobivaš novi slog. Kreneš s **2 života**, partija završava na 0.
* **Combo:** odgovor brži od 2 s povećava combo i daje +1 s sljedećem tajmeru; spor odgovor ga resetira.
* **Bodovi:** što je riječ duža, to više vrijedi: **broj slova na kvadrat** (kravata = 49, ukrasti = 64, neprobojnost = 144) + bonus za combo (2 × combo, najviše 30). Duga riječ uvijek vrijedi više od kraće.
* Životi se ne mogu dobiti natrag: kreneš s 2, a partija završava na 0.
* Dijakritici nisu obavezni: `kisobran` vrijedi ako postoji `kišobran`. Slog s dijakritikom (npr. `ŠA`) traži riječ koja ga stvarno sadrži, pa `sat` ne vrijedi.
* **Duhovi prijatelja:** tanka traka napretka s točkom za svakog prijatelja koji je danas igrao (gdje je pao), a tekst iznad nje kaže tko je sljedeći koga možeš prestići (`Sljedeći: Ivan · 23 — još 5`). Kad ga prestigneš, pojavi se *Prestigao si Ivana!*
* **Ljestvice** (uvijek najbolja pojedinačna partija, ne zbroj): *Prijatelji* (današnji najbolji među prijateljima), *Danas*, *Tjedan* (od ponedjeljka) i *High score* (svih vremena). Pri jednakim bodovima pobjeđuje partija s više riječi. U statistici se vide sve tvoje partije, a najbolja svakog dana je označena.

**Dnevni izazov:** niz slogova generira deterministički PRNG iz datuma (`bomba:YYYY-MM-DD`, vrijeme **Europe/Zagreb**, ponoć je granica za sve). Broj izazova = dani od lansiranja (30. 10. 2026. je #1). **Igraj koliko god puta želiš:** kad izgubiš (0 života), odmah možeš opet. Svi pokušaji istog dana koriste **isti niz slogova**, a na ljestvicama se gleda tvoj **najbolji rezultat (high score)**. **Refresh je nastavak, ne nova partija:** napredak se sprema nakon svakog koraka, a sat ne staje (ako tajmer istekne dok te nema, bomba je eksplodirala).
**Trening** (`/trening`) je neograničen, ne ide na ljestvicu; `/trening?seed=nesto` daje isti niz slogova svima koji otvore taj link.

## Pokretanje

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest (111 testova)
npm run lint       # provjera tipova
npm run build
```

Bez varijabli okoline radi **lokalni demo**: profil, partije i prijatelji su u `localStorage`, a ostali igrači su **simulirani** (jasno označeno u sučelju; `src/lib/repo/mock-community.ts`).
U razvoju možeš simulirati drugi dan s `?datum=2026-11-11` (u produkciji je isključeno).

## Rječnik (svi oblici riječi)

Izvor je hunspell rječnik `hr_HR` (npm `dictionary-hr`, autor Denis Lacković, licenca **LGPL-2.1 ili SISSL**; vidi `NOTICE-rjecnik.txt`).
`npm run rjecnik` (`scripts/build-dictionary.mjs`) pomoću `hunspell-reader` proširuje afikse (padeže, glagolske oblike…): **53.711 osnova → 1.048.868 oblika → 1.014.136 nakon filtra** (samo obične riječi: mala slova, 3–24 slova, sa samoglasnikom ili slogotvornim „r"; bez vlastitih imena i kratica).

| | |
|---|---|
| Format | front-coded popis sortiran po „složenom" ključu (č,ć→c, š→s, ž→z, đ→d), 1 bajt po slovu, blokovi od 128 zapisa |
| Veličina | 3,5 MB sirovo, **482 KB gzipano** (cilj je bio < 3 MB) |
| Provjera | binarno po blokovima + dekodiranje jednog bloka; **trenutna**, bez mreže, u **web workeru** |
| Memorija | ≈ 3,5 MB (ne milijun JS stringova) |

Zato nije trebalo filtrirati po frekvenciji: puni rječnik stane u 482 KB. Kompromis je kvaliteta, a ne veličina: hunspell proširenje sadrži i rijetke/arhaične oblike pa neke čudne riječi prolaze. Slogovi se zato biraju po broju različitih **korijena**, ne oblika (slog `jgr` ima 266 oblika, ali jedan korijen, pa nije pošten).

**Slogovi** (`src/lib/data/slogovi.json`, generirano): 2568 slogova u 3 težine (645 lakih, 785 srednjih, 1138 teških). Težina raste kroz partiju (prvih 5 su laki). Svaki ima ≥ 40 korijena riječi. Isti slog se ne ponavlja unutar 12 koraka.
> ⚠️ Nakon lansiranja **ne pokreći** `npm run rjecnik` bez razmišljanja: promjena skupa slogova mijenja nizove svim danima (test `syllables.test.ts` ima snapshot upravo zato).

## Anti-cheat

Klijent **nikad ne šalje bodove**, nego samo zapis partije `[{w: "riječ" | null, t: ms}, …]` (`null` = eksplozija).
`replayLog()` (`src/lib/game/replay.ts`) ponovno odigra partiju i provjeri:

* seed i slogove (generiraju se iz datuma, ne iz zapisa),
* da je riječ u rječniku, sadrži slog i nije ponovljena,
* da je svako vrijeme unutar dopuštenog tajmera (`t < limit`), a eksplozija točno na limitu,
* da je unos ljudski moguć (≥ 40 ms po slovu),
* da zapis ne nastavlja nakon kraja i da je partija završena,

pa **sam izračuna bodove**. Dodatno API ruta provjerava da zapis **ne traje dulje nego što je partija stvarno trajala** (vrijeme starta bilježi server), da datum određuje server (Europe/Zagreb), najviše 5 neuspjelih slanja po partiji, najviše 300 partija po igraču i danu te da je slanje idempotentno (isti zapis poslan ponovno vraća već upisanu partiju). Svaka partija ima vlastito vrijeme starta, pa se ne može „ubrzati" zapis.
**RLS** je uključen na svim tablicama; nema insert/update politika na `games`, `scores`, `streaks`, `friendships`. Rezultat upisuje samo `bomba_record_result()` koju smije pozvati samo `service_role`. Service-role ključ je samo na serveru.

> Ograničenje: ovo je provjera pravila i vjerodostojnosti, **ne** zaštita od bota koji stvarno igra u stvarnom vremenu s rječnikom. Za takvo što treba dodatni sloj (npr. CAPTCHA, ograničenja brzine, detekcija obrazaca).

## Supabase

1. Napravi projekt na [supabase.com](https://supabase.com).
2. U **SQL editoru** pokreni redom `supabase/migrations/0001_init.sql` (tablice, RLS, funkcije), pa `supabase/migrations/0002_neogranicene_partije.sql` (neograničen broj partija, ljestvice po najboljem rezultatu). Ako si već pokrenuo samo 0001, dovoljno je pokrenuti 0002: postojeći rezultati se čuvaju.
3. **Authentication → Sign In / Providers:** uključi **Allow anonymous sign-ins** (račun bez trenja) i **Email** (za povezivanje e-maila). Preporuka: uključi CAPTCHA za anonimne prijave da se ne mogu masovno otvarati računi.
4. **Authentication → URL Configuration:** *Site URL* = adresa aplikacije (npr. `https://bomba.vercel.app`), dodaj je i u *Redirect URLs*.
5. **Project Settings → API:** kopiraj *Project URL*, *anon key* i *service_role key*.
6. Kopiraj `.env.example` u `.env.local` i ispuni:
   ```
   NEXT_PUBLIC_SUPABASE_URL=…
   NEXT_PUBLIC_SUPABASE_ANON_KEY=…
   SUPABASE_SERVICE_ROLE_KEY=…     # samo server, nikad NEXT_PUBLIC_
   ```

Prvi ulazak: anonimna prijava + nasumično ime `igrac1234` koje igrač promijeni na stranici *Prijatelji*. Na istoj stranici može **povezati e-mail** (anonimni račun se pretvara u stalni) ili se na novom uređaju prijaviti poveznicom.

## Vercel

1. Postavi repozitorij na GitHub i na [vercel.com](https://vercel.com) odaberi **Add New → Project** i taj repozitorij (Next.js se prepoznaje sam).
2. U **Environment Variables** dodaj sve tri varijable gore (za *Production* i *Preview*). `SUPABASE_SERVICE_ROLE_KEY` ne označavaj kao javnu.
3. **Deploy.** Rječnik (`public/dict/hr.bin.gz`) server čita s diska; `next.config.mjs` ga uključuje u funkcije (`outputFileTracingIncludes`).
4. Preporuka: odaberi Vercel *region* blizu Supabase regije (manja latencija API ruta).
5. Nakon prvog deploya provjeri **Site URL** u Supabaseu (točka 4 gore).

## Struktura

```
src/app/                  stranice: / · /igra · /trening · /ljestvica · /statistika · /prijatelji · /pozivnica/[username] · /api/igra/*
src/components/           BombView (fitilj, iskra), GameScreen, GhostBar, LettersTracker, ResultPanel, LeaderboardTable…
src/hooks/useBombGame.ts  petlja igre: tajmer (rAF), unos, eksplozija, nastavak nakon refresha, predaja zapisa
src/workers/              web worker za rječnik
src/lib/game/             čista pravila: konstante, PRNG, slogovi, bodovanje, replay, datumi, statistika, dijeljenje
src/lib/dict/             rječnik, normalizacija dijakritika, provjera riječi, klijent za worker, učitavač za server
src/lib/repo/             sučelje · lokalni adapter + simulirana zajednica · Supabase adapter
src/lib/audio.ts          zvukovi (Web Audio API, bez datoteka) i vibracija
supabase/migrations/      shema, RLS, funkcije
scripts/build-dictionary.mjs   gradnja rječnika i slogova
tests/                    vitest
```

## Testovi

`npm test` (111 testova):

* **generator slogova:** determinizam, prefiksna stabilnost, rast težine, snapshot za 10. 11. 2026., rješivost svakog sloga,
* **pravila:** tajmer, combo, bodovanje po duljini riječi (dulja riječ uvijek vrijedi više), životi,
* **normalizacija dijakritika** i rječnik (*ukrao, kravatom, kišobran, kisobran → kišobran*, `sat` ≠ `ŠA`),
* **server replay:** valjana partija, lažni bodovi se ignoriraju, odbijanje (riječ izvan rječnika, bez sloga, ponovljena, istek tajmera, prebrz unos, krivi seed, partija nastavljena nakon kraja, nezavršena…),
* **datumi:** granica zagrebačke ponoći ljeti i zimi, odbrojavanje na dane promjene sata (23 h / 25 h),
* **neograničen broj partija:** nakon gubitka se odmah igra ponovno, slabija partija ne mijenja najbolji rezultat, bolja ga zamjenjuje, niz dana se ne udvostručuje drugom partijom istog dana (lokalni repozitorij i API rute),
* **nadogradnja baze 0001 → 0002 na bazi sa starim podacima** (rezultati se čuvaju i povezuju s partijama),
* **SQL na pravom Postgresu (PGlite):** migracija, okidač za profil, **RLS** (igrač ne može upisati ni promijeniti rezultat), `bomba_record_result` samo za `service_role`, nizovi, ljestvice, prijatelji,
* **API rute `/api/igra/*`** s pravom bazom: idempotentnost, odbijanje, brojač pokušaja, provjera proteklog vremena, razdvojenost igrača.

Uz to je cijeli tok prošao u pravom pregledniku (Playwright, mobilna i desktop veličina): stvarna partija s eksplozijama, krivi unosi, combo, duhovi i „Prestigao si…", refresh usred partije, eksplozija dok te nema, ljestvice, statistika, prijatelji, pozivnica, trening.

## Što je gotovo, a što nije

**Provjereno:** sva pravila igre, rječnik, generator slogova, server replay, SQL shema i RLS (PGlite), API rute (PGlite + zamijenjen Supabase klijent), cijeli tok u pregledniku (lokalni demo), produkcijski build.

**Nije provjereno** (u razvojnom okruženju nije bilo Supabase projekta, Vercela ni uređaja):
* `SupabaseRepository`, stvarna **anonimna prijava**, čitanje sesije iz cookieja u API rutama (`@supabase/ssr`) i povezivanje e-maila: napisano prema dokumentaciji, ali **nikad pokrenuto protiv pravog Supabasea**. Isprobaj cijeli tok na praznom projektu prije lansiranja.
* **Deploy na Vercel** nije napravljen.
* **Zvuk** (Web Audio) i **vibracija**: kod radi bez grešaka u pregledniku, ali zvuk nisam mogao čuti, a vibracija ne postoji u emulaciji.
* **Pravi mobiteli** (iOS Safari/Android Chrome): ponašanje tipkovnice i fokusa provjereno samo u emuliranom Chromiumu. Input se nikad ne uklanja iz DOM-a niti onemogućuje, da tipkovnica ostane otvorena, ali to treba vidjeti na uređaju.
* Ako se partija započne na jednom uređaju i napredak se izgubi (npr. brisanje podataka preglednika), ta se nezavršena partija odbacuje i počinje nova. Nema serverskog checkpointa partije.
