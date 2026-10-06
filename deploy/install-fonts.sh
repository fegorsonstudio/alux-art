#!/bin/bash
# Installs the fonts the server draws words with, and the rule that keeps the
# emoji font away from numbers.
#
#   Outfit        the carousel slides' and story GIFs' typeface (SIL Open Font
#                 Licence, deploy/fonts/outfit/OFL.txt). Has no ₦ sign — the
#                 server draws that one character in DejaVu, which it always has.
#   Noto Color    emoji in GIF text; without it they come out as code boxes.
#   Emoji
#   99-emoji-no-digits.conf
#                 stops the emoji font claiming 0-9, # and * — without it every
#                 price in a GIF reads "N 1 , 0 0 0".
#
# Fonts put on a server by hand vanish when it is rebuilt, and text then falls
# back to DejaVu with no error anywhere. So they live in the repo and this puts
# them back. Safe to run any number of times.
#
# Run as root from the app folder, then restart the app — a running process
# keeps the font list it started with:
#   bash deploy/install-fonts.sh && pm2 restart aluxart --update-env

set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! fc-list : family | grep -qx "Noto Color Emoji"; then
  apt-get install -y fonts-noto-color-emoji
fi

install -d /usr/share/fonts/truetype/aluxart
install -m 644 "$HERE"/fonts/outfit/*.ttf "$HERE"/fonts/outfit/OFL.txt /usr/share/fonts/truetype/aluxart/
install -m 644 "$HERE"/fonts/99-emoji-no-digits.conf /etc/fonts/conf.d/99-emoji-no-digits.conf
fc-cache -f

echo "Fonts installed. What the server now picks:"
for w in regular semibold bold extrabold black; do
  printf '  Outfit %-10s -> %s\n' "$w" "$(fc-match -f '%{family[0]} %{style[0]}' "Outfit:$w")"
done
printf '  sans-serif        -> %s (the default for everything else; unchanged)\n' "$(fc-match -f '%{family[0]}' sans-serif)"
