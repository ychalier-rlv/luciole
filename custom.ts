//% color="#ff6e19" weight=1
namespace luciole {

    class LedPattern {
        duration: number
        delay: number
        luminosity: number

        constructor(duration: number, delay: number, luminosity: number) {
            this.duration = duration;
            this.delay = delay;
            this.luminosity = luminosity;
        }

    }

    class NeopixelPattern {
        duration: number
        delay: number
        width: number
        red: number
        green: number
        blue: number

        constructor(duration: number, delay: number, width: number, rgb: number) {
            this.duration = duration;
            this.delay = delay;
            this.width = width;
            this.red = (rgb >> 16) & 0xFF;
            this.green = (rgb >> 8) & 0xFF;
            this.blue = (rgb) & 0xFF;
        }

    }

    let _period = 5000;
    let _last = -10000;
    let _strip: neopixel.Strip = null;
    let _hasStrip = false;
    let _ledPatterns: LedPattern[] = [];
    let _neopixelPatterns: NeopixelPattern[] = [];
    let _flashing = false;
    let _sync = false;

    const RADIO_GROUP = 1;

    const enum RadioCommand {
        Flash,
        Sync,
        Desync,
        SyncOn,
        SyncOff,
        DesyncSyncOff,
    }

    //% block="initialiser la luciole"
    export function initialize() {
        radio.setGroup(RADIO_GROUP);
        radio.setTransmitPower(0);
    }

    //% block="définir la vitesse de l'horloge à (ms) $period"
    //% period.min=1 period.max=10000 period.defl=5000
    export function setPeriod(period: number) {
        _period = period;
    }

    //% block="associer la luciole au ruban LED $strip"
    export function setStrip(strip: neopixel.Strip) {
        _strip = strip;
        _hasStrip = true;
    }

    //% block="lorsque l'horloge interne sonne 'midi'"
    export function onFlash(handler: () => void) {
        basic.forever(() => {
            let now = input.runningTime();
            if (now >= _last + _period) {
                _last = now;
                radio.sendNumber(RadioCommand.Flash);
                _ledPatterns = [];
                _neopixelPatterns = [];
                handler();
                displayPatterns();
            }
        });
    }

    function displayNeopixelPatterns() {
        let n = _strip.length();
        let t0 = input.runningTime();
        while (true) {
            let allDone = true;
            let t = input.runningTime();
            let colors = [];
            for (let i = 0; i < n; i++) {
                colors.push([0, 0, 0]);
            }
            for (let k = 0; k < _neopixelPatterns.length; k++) {
                let pattern = _neopixelPatterns[k];
                let i_front = (t - t0 - pattern.delay) / pattern.duration * n;
                if (i_front < n + pattern.width) {
                    allDone = false;
                } else {
                    continue;
                }
                for (let i = 0; i < n; i++) {
                    let luminosity = 0;
                    if (i <= i_front && i >= i_front - pattern.width) {
                        luminosity = Math.max(0, 1 - (i_front - i) / pattern.width);
                    }
                    colors[i][0] += Math.floor(pattern.red * luminosity);
                    colors[i][1] += Math.floor(pattern.green * luminosity);
                    colors[i][2] += Math.floor(pattern.blue * luminosity);
                }
            }
            if (allDone) {
                break;
            }
            for (let i = 0; i < n; i++) {
                _strip.setPixelColor(i, neopixel.rgb(
                    Math.min(255, colors[i][0]),
                    Math.min(255, colors[i][1]),
                    Math.min(255, colors[i][2])
                ));
            }
            _strip.show();
        }
        _strip.showColor(neopixel.colors(NeoPixelColors.Black));
    }

    function displayLedPatterns() {
        let t0 = input.runningTime();
        while (true) {
            let t = input.runningTime();
            let luminosity = 0;
            let allDone = true;
            for (let k = 0; k < _ledPatterns.length; k++) {
                let pattern = _ledPatterns[k];
                let elapsed = t - t0 - pattern.delay;
                if (elapsed < pattern.duration) {
                    allDone = false;
                } else {
                    continue;
                }
                if (elapsed >= 0) {
                    luminosity += Math.max(0, pattern.luminosity - elapsed / pattern.duration);
                }
            }
            if (allDone) {
                break;
            }
            let brightness = Math.floor(255 * Math.min(1, luminosity));
            for (let x = 0; x < 5; x++) {
                for (let y = 0; y < 5; y++) {
                    led.plotBrightness(x, y, brightness);
                }
            }
        }
        basic.clearScreen();
    }

    function displayPatterns() {
        _flashing = true;
        if (_hasStrip) {
            displayNeopixelPatterns();
        } else {
            displayLedPatterns();
        }
        _flashing = false;
    }

    //% block="activer la synchronisation"
    export function turnSyncOn() {
        _sync = true;
    }

    //% block="désactiver la synchronisation"
    export function turnSyncOff() {
        _sync = false;
    }

    //% block="lorsqu'une luciole voisine clignote"
    export function onNeighborFlash(handler: () => void) {
        radio.onReceivedNumber(function(receivedNumber: number) {
            if (receivedNumber == RadioCommand.Flash) {
                if (_sync && !_flashing) {
                    handler();
                }
            } else if (receivedNumber == RadioCommand.Sync) {
                backdoorSynchronize();
            } else if (receivedNumber == RadioCommand.Desync) {
                backdoorDesynchronize();
            } else if (receivedNumber == RadioCommand.SyncOn) {
                turnSyncOn();
            } else if (receivedNumber == RadioCommand.SyncOff) {
                turnSyncOff();
            } else if (receivedNumber == RadioCommand.DesyncSyncOff) {
                turnSyncOff();
                backdoorDesynchronize();
            }
        });
    }

    function backdoorSynchronize() {
        _last -= _period;
    }

    function backdoorDesynchronize() {
        _last = input.runningTime() - Math.floor(Math.random() * _period);
    }

    //% block="clignoter maintenant"
    export function flashNow() {
        _last -= 2 * _period;
    }

    //% block="avancer l'horloge interne de (pourcent) $k"
    //% k.min=0 k.max=100 k.defl=7
    export function flashSoonerLinear(k: number) {
        let now = input.runningTime();
        let clock = (k/100 + 1) * (now - _last) / _period;
        if (clock > 1) {
            clock = 1;
        }
        _last = now - clock * _period;
    }

    //% block="avancer l'horloge interne de (ms) $ms"
    //% ms.min=0 ms.max=5000 ms.defl=100
    //% advanced=true
    export function flashSoonerConstant(ms: number) {
        _last -= ms;
    }

    //% block="avancer le prochain clignotement || dans une fenêtre de (ms) $window_ms"
    //% window_ms.min=0 window_ms.max=5000 window_ms.defl=200
    //% advanced=true
    export function phaseAdvance(window_ms: number) {
        let now = input.runningTime();
        if (now >= _last + _period - window_ms) {
            _last -= 2 * _period;
        }
    }

    //% block="reculer le prochain clignotement"
    //% advanced=true
    export function phaseDelay() {
        let now = input.runningTime();
        _last = now;
    }

    //% block="clignoter le ruban pendant (ms) $duration après (ms) $delay|| largeur $width couleur $rgb=neopixel_colors"
    //% duration.min=0 duration.max=5000 duration.defl=500
    //% delay.min=0 delay.max=5000 delay.defl=0
    //% width.min=0 width.max=30 width.defl=10
    //% rgb.min=0 rgb.max=16777216 rgb.defl=2752386
    //% expandableArgumentMode="toggle"
    export function addNeopixelPattern(duration: number, delay: number, width: number = 10, rgb: number = 2752386) {
        _neopixelPatterns.push(new NeopixelPattern(duration, delay, width, rgb));
    }

    //% block="clignoter les LED pendant (ms) $duration après (ms) $delay || luminosité $luminosity"
    //% duration.min=0 duration.max=5000 duration.defl=200
    //% delay.min=0 delay.max=5000 delay.defl=0
    //% luminosity.min=0 luminosity.max=255 luminosity.defl=255
    export function addLedPattern(duration: number, delay: number, luminosity: number = 1) {
        _ledPatterns.push(new LedPattern(duration, delay, luminosity/255));
    }

    //% block="activer la télécommande"
    //% advanced=true
    export function enableRemote() {
        radio.setGroup(RADIO_GROUP);
        radio.setTransmitPower(5);
        input.onButtonPressed(Button.A, function() {
            radio.sendNumber(RadioCommand.SyncOn);
            turnSyncOn();
        });
        input.onButtonPressed(Button.B, function() {
            radio.sendNumber(RadioCommand.DesyncSyncOff);
            turnSyncOff();
            backdoorDesynchronize();
        });
    }

}