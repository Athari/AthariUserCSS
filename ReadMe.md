# User CSS

A collection of **user styles** by [@Athari](/Athari).

* [DerpiBooru.org / TrixieBooru.org](#derpibooru)
* [e621.net / e926.net / e6ai.net](#e621)
* [FurAffinity.net](#furaffinity)
* [InkBunny.net](#inkbunny)
* [Kinorium.com](#kinorium)

**See also:** [User JS](https://github.com/Athari/AthariUserJS) (@Athari's collection of user scripts).

**Note:** Functionality may be limited in Firefox as some user styles rely on [CSS container style queries](https://caniuse.com/css-container-queries-style) for conditionally applying configurable options. Sadly, all CSS preprocessors supported by the Stylus extension are essentially abandoned and break basic CSS features, which turns writing styles into navigating a minefield; and Firefox is behind in implementing modern CSS features, which limits the functionality available to pure CSS styles. With Firefox's dwindling worldwide usage numbers, I have to make the choice in favor of preserving whatever remains of my sanity.

## ⚙️ Instructions

1. **Install ![][Stylus Logo] Stylus extension**:

   * [Stylus for Chrome](https://chrome.google.com/webstore/detail/stylus/clngdbkpkpeebahjckkjfobafhncgmne)

   * [Stylus for Firefox](https://addons.mozilla.org/firefox/addon/styl-us/)

   (*Note:* Among user style extensions, Stylus is the best by far. If you have another user style extension installed already, consider switching to Stylus.)

2. It is recommended to **put the extension's button on the toolbar** as it'll give access to the currently installed user styles and their options.

3. Go to a user style below and **click on its ![User Style Install][Install Style] badge**. You'll see a preview of the style and sometimes an options dialog.

4. Adjust the options if needed, then **click on the ![Install style][Install Style Stylus] button** in the left panel.

5. If at any point you want to **adjust options**, click on the Stylus extension button ![][Stylus Logo], then click on the gear wheel button next to the style.

## <a id="derpibooru"/> ![](https://icons.duckduckgo.com/ip3/derpibooru.org.ico) DerpiBooru.org / TrixieBooru.org

### DerpiBooru.org - Tweaks [![Install DerpiBooru.org Tweaks Style][Install Style]](DerpiBooru/DerpiBooru-Tweaks.user.css?raw=1)

![DerpiBooru.org - Tweaks Screenshot](DerpiBooru/DerpiBooru-Tweaks.png?raw=1)

Various small tweaks in usability, all toggled through options.

* Long search box.
* Rearranged top menu with expanded user hamburger menu.
* Thumbnails in enforced native 250x250 size without spacing.
* Rating borders for thumbnails like on FA (disabled by default).
* Pagination with long prev/next buttons in static positions.
* Download/view buttons in static positions.
* Hiding controls for hiding posts (disabled by default).
* Compact footer.

## <a id="e621"/> ![](https://icons.duckduckgo.com/ip3/e621.net.ico) e621.net / e926.net / e6ai.net

### e621.net - Tricksta Esix [![Install e621.net Tricksta Esix Style][Install Style]](e621/e621-TrickstaEsix.user.css?raw=1)

![e621.net - Tricksta Esix Screenshot](e621/e621-TrickstaEsix.png?raw=1)

Redesign of the front page. It is optimized for high screen resolutions, but should work on smaller screens too, just not too tiny.

* Esix, the mascot of e621/e962/e6ai, as drawn by Tricksta, on the front page.
* Esix comes in three versions, you can choose any version for every website individually.
* Redesigned controls to match the mascot.
* Small Esix at the bottom of every page.

## <a id="furaffinity"/> ![](https://icons.duckduckgo.com/ip3/furaffinity.net.ico) FurAffinity.net

### FurAffinity.net - Tweaks [![Install FurAffinity.net Tweaks Style][Install Style]](FurAffinity/FurAffinity-Tweaks.user.css?raw=1)

![FurAffinity.net - Tweaks Screenshot](FurAffinity/FurAffinity-Tweaks.jpg?raw=1)

Various small tweaks in usability and style, all toggled through options. It is designed for the "Modern" layout template and will likely not work in the "Classic" layout.

* Round corners with soft shadows for blocks
* Search and browse forms on top the page (longer search input, no sidebar)
* Static Prev/Next buttons overlayed on top of an image submission in static position
* Image submission height constrained to the screen size (ads are assumed to be hidden with an ad blocking extension)
* Changing "rating" border thickness
* Hiding fat "modern" header on top
* Hiding FA+, virtue signaling, scraping warning
* Hiding redundant controls on the submission page

## <a id="inkbunny"/> ![](https://icons.duckduckgo.com/ip3/inkbunny.net.ico) InkBunny.net

### InkBunny.net – Compact Dark [![Install InkBunny.net Compact Dark Style][Install Style]](InkBunny/InkBunny-CompactDark.user.css?raw=1)

![InkBunny.net – Compact Dark Screenshot](InkBunny/InkBunny-CompactDark.jpg?raw=1)

Primarily a dark theme, but includes several optional usability improvements.

* Dark theme
* Restyled text submission reading mode with detailed options
* High-quality vector SVG images
* Adjustable colors
* Compact header and footer options
* Pagination improvements

## <a id="kinorium"/> ![](https://icons.duckduckgo.com/ip3/kinorium.com.ico) Kinorium.com

### Kinorium.com – Enhanced [![Install Kinorium.com Enhanced Style][Install Style]](Kinorium/Kinorium-Enhanced.user.css?raw=1)

![Kinorium.com – Enhanced Screenshot](Kinorium/Kinorium-Enhanced.jpg?raw=1)

Various usability enhancements, with options to toggle some of them:

* Side menus on wide monitors
* More compact layout without lots of wasted space
* Displaying both IMDB and Kinopoisk ratings at the same time
* Displaying related movies of all kinds at the same time
* Displaying URLs under streaming provider buttons
* Detailed coloring of season/episode ratings table
* Coloring of positive/neutral/negative reviews
* Native sliders with native scrollbars (requires userscript)
* Less confusing scrollbar colors
* Longer dropdown lists
* More highlighting on hover
* Improved rating contrast
* Custom interface font
* Hide top genre and current movies
* Hide banners
* Hyphenation
* etc.

This user style is designed to be used in conjunction with the [user script "Kinorium.com – Enhanced"](https://github.com/Athari/AthariUserJS#kinorium) [![Install Kinorium.com Enhanced Script][Install Script]](https://github.com/Athari/AthariUserJS/blob/master/Kinorium/Kinorium-Enhanced.user.js?raw=1).

[Stylus Logo]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAeFBMVEUAAAAm+/cn/fkn//wm//wn/fkANS0n//sCQTol9PETmpQcysYTlpESk44SkIsNe3Qm9/Qj6OQf1tIXrqkUnZcOhH4FUUoANy8m+vYk8ewi4t8g4Nsdz8oavLcZubUZt7MVop0PiIINfnkKbmgJZ2AHXVcGU00DRj5BSX4OAAAABnRSTlMA8fJbVfVdb86DAAAAh0lEQVQY013PWRKDIBBF0UZNP0BB45h5Hva/wzSFISnvF3U++hVEeYaUKohIVZyySgDyeJ23wLpmRoTRIPSDDhjeD6cTlNholhL0csDrGWCZ9QGA8QIOhLA6XXdCPXOFOCvdDMw034idAP0Ffxxq22D/NxtqngnuXduWl5EjKLf4XL5CKivoA3AuCHPhSbdbAAAAAElFTkSuQmCC
[Install Style]: https://img.shields.io/badge/User%20Style-Install-brightgreen?logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAeFBMVEUAAAAm+/cn/fkn//wm//wn/fkANS0n//sCQTol9PETmpQcysYTlpESk44SkIsNe3Qm9/Qj6OQf1tIXrqkUnZcOhH4FUUoANy8m+vYk8ewi4t8g4Nsdz8oavLcZubUZt7MVop0PiIINfnkKbmgJZ2AHXVcGU00DRj5BSX4OAAAABnRSTlMA8fJbVfVdb86DAAAAh0lEQVQY013PWRKDIBBF0UZNP0BB45h5Hva/wzSFISnvF3U++hVEeYaUKohIVZyySgDyeJ23wLpmRoTRIPSDDhjeD6cTlNholhL0csDrGWCZ9QGA8QIOhLA6XXdCPXOFOCvdDMw034idAP0Ffxxq22D/NxtqngnuXduWl5EjKLf4XL5CKivoA3AuCHPhSbdbAAAAAElFTkSuQmCC
[Install Style Stylus]: https://img.shields.io/badge/Install%20style-666?labelColor=444&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAeFBMVEUAAAAm+/cn/fkn//wm//wn/fkANS0n//sCQTol9PETmpQcysYTlpESk44SkIsNe3Qm9/Qj6OQf1tIXrqkUnZcOhH4FUUoANy8m+vYk8ewi4t8g4Nsdz8oavLcZubUZt7MVop0PiIINfnkKbmgJZ2AHXVcGU00DRj5BSX4OAAAABnRSTlMA8fJbVfVdb86DAAAAh0lEQVQY013PWRKDIBBF0UZNP0BB45h5Hva/wzSFISnvF3U++hVEeYaUKohIVZyySgDyeJ23wLpmRoTRIPSDDhjeD6cTlNholhL0csDrGWCZ9QGA8QIOhLA6XXdCPXOFOCvdDMw034idAP0Ffxxq22D/NxtqngnuXduWl5EjKLf4XL5CKivoA3AuCHPhSbdbAAAAAElFTkSuQmCC
[Install Script]: https://img.shields.io/badge/User%20Script-Install-brightgreen?logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAACvElEQVQoz23STUiTAQDG8Sezmx5fuuw0gx1eGPSGsBiLJUPEREQco5gYhoXGUExT/Fq2JalT5mypaOZsISlqWomoSJliTNTUvtSZFiZhH2aIznTv08EOHnrO/9/tAQ5NAEIAhCgBxKgRmqHDmXwNqjM1mDercPJfFoL/IOhFHMvVIrXcgKkbeuxdjhSYqhaGzJEITZRwXHHIHAEQCgAXJeGEXY+JSgNYqIOcJiGYrgLz1HhTEY2JYg1OCwcmFAJwVACQroPCrsWn6jgFbTr8KZCwf1MLeiw6ucWiY5kO6xYNIjJVCNMrACRJCM+WEGGNhLejMJaz3Tm7k4+y6D6vZn+1mSvDpVzoLwr22JNkmxbfnXGK9asanEOJAR2uRBVrTOLeu6f58ucXdm5OO7k2eptfX5Xz24SDa2O3Od9XKDekRu73VZpo1WMId0yi/KTcSG+OQf7ysoxffVX03rNwabSS78ectJdf5Op4Bb/5HPRkRu133zKywiTOoNas3mgvTaAnyyD/mnZyadxJU1EuWxypHBl0E9HxnOgtZmC+nt124747RaItTumBwyDccyer2VWaGNx6W8dVXy2hADuaCjgz7KIkCfSP1jCw2CSvDNvojFf8uSThFLJVQrhNxNzbnnxuzNwJ7vgfcHWqmT8WuhhY7efWcid3l9s423uD674que16DC1KxCJBLaBEwujHQSvHvTnBgfpsfhqr4+LLRs4O3KWvs4ze4hS225K5Me0MNl/R0qJGDIyiALsSTYOuFP587drtc2WwJdfE5mwTW/Mu8LEjnVPdpfLOQuPeZFsWrRI+JOmFMIgArmmgsmnxY6QhjZtzbnl78T63/V4Glh5y2+/h96la+Xl9Gm/p8LsoDmdx+LTpEk4VKvHKZRSDndYEPqs0s6fMxNbMKLkiWljLE9CYLwkqUXVg/gKaZ3VuIbnk5AAAAABJRU5ErkJggg==