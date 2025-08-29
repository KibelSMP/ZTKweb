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
