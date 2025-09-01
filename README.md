# ZTKweb

Statyczna aplikacja webowa do przeglądania niestandardowej mapy połączeń świata ZTK (trasy i stacje) oraz eksportu podglądu do PDF.

## Struktura

- `index.html` — główna aplikacja (przeglądarka + wyszukiwarka + legenda).
- `export.html` — strona eksportu z konfigurowalnymi opcjami i podglądem na stronie A4.
- `assets/` — zasoby statyczne (style, skrypty, dane JSON).

## Uruchomienie (dev)

Wystarczy otworzyć `index.html` w nowoczesnej przeglądarce. Nie ma potrzeby budowania projektu.

## Licencja

Zawartość i kod są dostępne na licencji CC BY-NC-SA 4.0. Szczegóły w pliku `LICENSE`.

## Strona eksportu

- Otwórz `export.html`, ustaw opcje (tytuł, widok satelitarny, typy linii, skala legendy) i zobacz podgląd na stronie A4.
- Użyj przycisku „Pobierz PDF”, aby zapisać podgląd jako plik PDF.

## Parametry URL (index.html)

Możesz linkować bezpośrednio do stacji lub wyszukiwania trasy przez parametry zapytania:

- `?station=ID` lub `?station=Nazwa` – wycentruje mapę na stacji i ją podświetli.
- `?from=ID&to=ID` – wczyta i uruchomi wyszukiwanie trasy między stacjami.
- `&sel=0..N` – wybierze trasę o danym indeksie (po uruchomieniu wyszukiwania).
- `&types=IC,REGIO,METRO,ON_DEMAND` – wstępnie ustawi filtr typów linii.
- `&prio=transfers|stops` – wybór kryterium wyszukiwania: preferuj mniej przesiadek (transfers) lub mniej przystanków (stops).

W polach „Skąd/Dokąd” zatwierdź Enterem. Autouzupełnianie działa po nazwie stacji (ID nadal wspierane w tle).