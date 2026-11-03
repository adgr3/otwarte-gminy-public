# Notatki ze źródeł (verification log) — 2026-09-05

## z-dykty.pl — odkrycia operacyjne

1. **API za kluczem**: `Authorization: Bearer zd_live_…` (błąd 401 `brak_klucza`
   zwraca id_zadania). Brak klucza w środowisku → wszystkie `/api/v1/*`
   `BLOCKED_BY_API_KEY`. OpenAPI: `/api/v1/openapi.json` publiczny; stronicowanie
   wyłącznie kursorowe (`nastepny_kursor`), warstwa ucina odpowiedź na 1000
   wierszach; limity: `X-RateLimit-Remaining`/`X-Zuzycie-Miesiac`.
2. **Dane publiczne**: `/dane/gmina/{slug}` (finanse, ludność, TERYT, powiat;
   licencja CC BY 4.0, atrybucja: „Dane: z-dykty.pl (CC BY 4.0)"),
   `/dane/gmina/{slug}/md` (markdown), `/gmina/{slug}/przetargi` i `/umowy`
   (HTML z danymi w strumieniu RSC `self.__next_f.push` — parser:
   `scripts/fetch_snapshot.py:rsc_stream/extract_items`).
3. **Licznik rekordów** na stronie przetargów ma twardą spację (U+00A0) jako
   separator tysięcy: „36 883" — parsowanie regex musi ją usuwać (Warszawa:
   36 883, nie 36).
4. **Limit 100 najnowszych** na stronę gminy; parametry URL (`?strona`, `?limit`,
   `?od`, `?do`) są ignorowane (zweryfikowane na 5 wariantach — zawsze ten sam
   zbiór 100).
5. **`poziom`** (`gmina`/`panstwo`/`nieznany`) klasyfikuje sektor zamawiającego;
   strona gminy zawiera zamówienia wszystkich podmiotów z TERYTU gminy, np. strona
   Warszawy: TVP, GIF, bazy logistyczne MON (poziom=panstwo). Metryki gminne =
   wyłącznie `poziom=gmina`.
6. **Umowy CRU**: publikowane tylko od 2026-07-01 (obowiązek ustawowy);
   `zrodlo_url` generyczne (bez deep-linku); Warszawa/Otwock/Jabłonna/Józefów/
   Michałowice/Karczew: zero umów zmapowanych (strona komunikuje to wprost).
7. **Dokumentacja z-dykty potwierdza**: „lista ogłoszeń BZP kwoty nie zawiera"
   (`kwota: null` to właściwość źródła, nie brak parsowania); przykładowy rekord
   API na /dla-firm ma identyczne pola jak strona publiczna + `gmina_teryt`.
8. **feed.xml** (Atom): najnowsze pozycje z linkami `/gmina/{slug}#{sekcja}`;
   przydatny jako inkrementalny trigger, nie jako źródło historii.

## Peer group (Task A) — metodologia

- Kandydaci: wszystkie gminy mazowieckie z 8 powiatów wokół Warszawy
  (warszawski zachodni, pruszkowski, piaseczyński, otwocki, miński, wołomiński,
  legionowski, nowodworski) — 64 kandydatów; rejestr z rankingowego CSV z-dykty
  (2479 gmin: nazwa/powiat/woj/teryt/slug — pochodna TERYT/GUS).
- Granice: relacje OSM `boundary=administrative` `admin_level=8` pobrane przez
  Nominatim (z walidacją `display_name` zawiera `powiat X` + `mazowieckie` —
  chroni przed kolizjami nazw, np. Józefów otwocki vs biłgorajski), poligon
  Warszawy: relacja OSM 336074 (0,068°² ≈ 517 km² — zgodne z GUS).
  Sąsiedztwo: `intersection().length > 0.005°` (~0,4 km wspólnej granicy).
- Wynik: **18 bezpośrednich sąsiadów** + Warszawa (metro_core) + demo_ring
  (Pruszków, Otwock, Legionowo, Karczew — decyzja produktowa, nie geometria).
  Wykluczeni po obliczeniu (m.in.): Legionowo, Otwock, Pruszków, Karczew,
  Nowy Dwór Mazowiecki, Serock, Halinów, Wołomin, Radzymin — nie stykają się
  z Warszawą w geometrii OSM.
- Dane administracyjne każdej gminy z `/dane/gmina/{slug}` (typ, powiat, ludność
  GUS 2025) — TERYT rejestru = TERYT karty gminy dla wszystkich 23 JST.

## Rozbieżności i pułapki danych

- **Łomianki**: z-dykty `typ=3` (miejsko-wiejska), wg GUS gmina miejska —
  udokumentowana rozbieżność klasyfikacji; w peer_group.json obie wartości.
- **Mapowanie `typ` z-dykty** (obserwowane 1/2/3): 1=miejska lub miasto na prawach
  powiatu (w tym Warszawa), 2=wiejska, 3=miejsko-wiejska.
- **Wykonawca = jeden napis**: konsorcja rozdzielone przecinkami, czasem z
   POWTÓRZENIAMI członów (per część zamówienia, np. „X, Y, X, Y") i wspólnikami
   spółek cywilnych; flaga `entity_kind=possible_consortium` (114/646 kluczy po korekcie; gołe Sp.k./Sp.j. → single).
- **Różne pisownie tej samej firmy**: „DROG-REM Spółka z o.o." vs „DROG-REM Sp. z
  o.o." vs „DROG-REM Sp. zo.o. Sp.k." — normalizujemy wyłącznie typografię
  (cudzysłowy, `Z O. O.`→`Z O.O.`, `S. A.`→`S.A.`); formy prawne NIE scalane →
  sieć nazewna = dolne ograniczenie obecności (FAL-BRUK występuje w 3 wariantach
  zapisu; najdłuższy wariant: 7 gmin).
- **Data rozstrzygnięcia**: brak dedykowanego pola; `data_publikacji` ogłoszenia
  wynikowego (tam gdzie jest `wykonawca`) to najlepsze przybliżenie.
- **Poziom 'nieznany'**: 10–16% rekordów per gmina — wykluczone z metryk gminnych
  (nie zakładamy, że to gmina).

## Źródła pierwotne (niewykorzystane, odnotowane)

- eZamówienia BZP API (`/mo-board/api/v1/notice`, SOAP WebService bzp.uzp.gov.pl):
  wymaga rejestracji/klucza → poza zakresem spike'u (z-dykty wystarczył na MVP
  bez NIP; z NIP nie wystarczy — patrz BLOCKER w DATA_SPIKE_REPORT.md).
- searchbzp.uzp.gov.pl: UI za WAF (barracuda), bez jawnego JSON API.
- GUGiK PRG WFS (oficjalne granice): zwraca 401 — niedostępne bez uwierzytelnienia.
