#!/usr/bin/env bash
# Dauerlauf für die Aktienkurse (statt unzuverlässiger GitHub-Zeitpläne):
# alle 10 Min. 5-Minuten-Kurse (markt.py intraday), alle 30 Min. Kurse (stocks.py).
# Läuft Mo-Fr 06:00-23:59 UTC, max. ca. 5 Std. 40 Min. pro Lauf, danach startet er sich selbst neu.
set -u
git config user.name "kurs-bot"
git config user.email "kurs-bot@users.noreply.github.com"
ENDE=$((SECONDS + 340*60))
n=0
im_fenster() { [ "$(date -u +%u)" -le 5 ] && [ "$(date -u +%H)" -ge 6 ]; }
while [ $SECONDS -lt $ENDE ] && im_fenster; do
  start=$SECONDS
  if python markt.py intraday; then
    ( cd markt_out && rm -rf .git && git init -q && git checkout -q -b markt-data && git add . \
      && git -c user.name=kurs-bot -c user.email=kurs-bot@users.noreply.github.com commit -q -m "Markt Tagesverlauf $(date -u +%H:%MZ)" \
      && git push -q -f "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" markt-data ) || echo "Tagesverlauf: Hochladen fehlgeschlagen"
  fi
  if [ $((n % 3)) -eq 0 ]; then
    if python stocks.py; then
      git add data/
      if ! git diff --staged --quiet; then
        git commit -q -m "Kurse aktualisiert"
        for i in 1 2 3 4; do git pull -q --rebase origin main && git push -q origin HEAD:main && break; sleep $((i*5)); done
      fi
    fi
  fi
  n=$((n+1))
  rest=$((600 - (SECONDS - start)))
  [ $rest -gt 0 ] && sleep $rest
done
# noch im Handelsfenster -> nächsten Lauf anstoßen
if im_fenster; then
  gh workflow run kurse-live.yml --ref main -R "$GITHUB_REPOSITORY" && echo "Nächster Lauf gestartet"
fi
