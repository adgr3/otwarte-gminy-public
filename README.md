# Otwarte Gminy - Pruszkow

Publiczny, nieoficjalny serwis danych o finansach publicznych Pruszkowa
(TERYT 1421021): https://pruszkow.otwartegminy.pl/

## Zakres snapshotu

Snapshot zawiera **tylko kod zrodlowy i narzedzia publikacji/budowy**.
Nie zawiera danych produkcyjnych ani zbudowanego `static-out-public/`.

- `static-site/`, `static-worker/` i `scripts/static/`;
- `data/sample/registry-sample.json` - maks. 20 syntetycznych rekordow
  przykladowych, wylacznie ze spolkami/instytucjami (bez osob fizycznych i JDG);
- konfiguracja i manifest pakietu.

## Pobieranie danych

Pelne dane nie sa czescia repozytorium i sa ignorowane przez git:

```bash
python scripts/fetch_public_data
```

Skrypt pobiera `registry.json` i `meta.json` z produkcji do `data/live/`,
sprawdza SHA-256 zapisanych plikow i zgodnosc liczby rekordow z meta. Kolejne
uruchomienie weryfikuje nowy download względem `data/live/SHA256SUMS`; użyj
`--update`, aby świadomie zastąpić sumy. Katalog `data/live/` jest w
`.gitignore`. Weryfikacja SHA-256 sprawdza zgodność z opublikowanym manifestem
(sumami), nie jest podpisem kryptograficznym ani poświadczeniem autentyczności.

## Dane przykladowe

`data/sample/registry-sample.json` jest oznaczony jako `sample: true` i zawiera
wylacznie fikcyjne nazwy spolki/instytucji z prefiksem `[PRZYKŁAD]`. To nie jest
probka produkcyjna.

## Licencje danych

- Dane zrodlowe BIP i CRU to informacja publiczna; serwis ich nie zastępuje.
- Opracowanie/kompilacja i warstwa prezentacji: **CC BY 4.0**.
- Jesli wykorzystano dane z `z-dykty.pl`: **CC BY 4.0**, z atrybucja
  "Dane: z-dykty.pl (CC BY 4.0)".
- Repozytorium **nie zawiera danych**; `scripts/fetch_public_data` pobiera je
  z serwisu do lokalnego, ignorowanego katalogu.

## Zrodla

| Zrodlo | Co daje |
|---|---|
| BIP Pruszkow | rejestr umow |
| Centralny Rejestr Umow JSFP (CRU) | umowy jednostek sektora finansow publicznych |

Serwis jest nieoficjalny: nie zastepuje BIP ani CRU i nie jest publikacja
Urzedu Miasta Pruszkowa.

## Licencja

MIT - see `LICENSE`.
