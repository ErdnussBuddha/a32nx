import { FlightPlanManager } from '@shared/flightplan';

export class Waypoint {
    public ident: string = '';

    public altitude: number = 0;

    public utc: number = 0;

    constructor(ident: string) {
        this.ident = ident;
    }
}

export class FlightStateObserver {
    public LastWaypoint: Waypoint | undefined = undefined;

    public PresentPosition = { lat: null, lon: null, altitude: null, heading: null, track: null, indicatedAirspeed: null, groundSpeed: null, verticalSpeed: null };

    public FcuSettings = { apActive: false, speed: null, machMode: false, altitude: null }

    public ActiveWaypoint: Waypoint | undefined = undefined;

    public NextWaypoint: Waypoint | undefined = undefined;

    private static findLastWaypoint(fp) {
        if (fp) {
            let idx = fp.activeWaypointIndex;
            while (idx >= 0) {
                const wp = fp.getWaypoint(idx);
                if (wp?.waypointReachedAt !== 0) {
                    return wp;
                }

                idx -= 1;
            }
        }

        return null;
    }

    private updatePresentPosition() {
        this.PresentPosition.lat = SimVar.GetSimVarValue('GPS POSITION LAT', 'degree latitude');
        this.PresentPosition.lon = SimVar.GetSimVarValue('GPS POSITION LON', 'degree longitude');
        this.PresentPosition.altitude = Math.round(SimVar.GetSimVarValue('PLANE ALTITUDE', 'feet'));
        this.PresentPosition.heading = Math.round(SimVar.GetSimVarValue('GPS GROUND TRUE HEADING', 'degree'));
        this.PresentPosition.track = Math.round(SimVar.GetSimVarValue('GPS GROUND TRUE TRACK', 'degree'));
        this.PresentPosition.indicatedAirspeed = Math.round(SimVar.GetSimVarValue('AIRSPEED INDICATED', 'knots'));
        this.PresentPosition.groundSpeed = Math.round(SimVar.GetSimVarValue('GROUND VELOCITY', 'knots'));
        this.PresentPosition.verticalSpeed = Math.round(SimVar.GetSimVarValue('VERTICAL SPEED', 'feet per second'));
    }

    private updateFcu() {
        const ap1 = SimVar.GetSimVarValue('L:A32NX_AUTOPILOT_1_ACTIVE', 'bool');
        const ap2 = SimVar.GetSimVarValue('L:A32NX_AUTOPILOT_2_ACTIVE', 'bool');

        const thrustMode = SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_MODE', 'number');
        this.FcuSettings.apActive = ap1 || ap2;

        if (this.FcuSettings.apActive) {
            this.FcuSettings.altitude = Math.round(SimVar.GetSimVarValue('A32NX_FG_TARGET_ALTITUDE', 'number'));
            this.FcuSettings.machMode = thrustMode === 8;
            if (thrustMode === 0) {
                if (this.FcuSettings.machMode) {
                    this.FcuSettings.speed = SimVar.GetSimVarValue('L:A32NX_MachPreselVal', 'number');
                } else {
                    this.FcuSettings.speed = SimVar.GetSimVarValue('L:A32NX_SpeedPreselVal', 'number');
                }
            } else if (this.FcuSettings.machMode) {
                this.FcuSettings.speed = SimVar.GetSimVarValue('AIRSPEED INDICATED', 'knots');
            } else {
                this.FcuSettings.speed = SimVar.GetSimVarValue('AIRSPEED MACH', 'mach');
            }
        } else {
            this.FcuSettings.altitude = null;
            this.FcuSettings.machMode = false;
            this.FcuSettings.speed = null;
        }
    }

    constructor(mcdu) {
        setInterval(() => {
            const fp = (mcdu.flightPlanManager as FlightPlanManager).activeFlightPlan;
            const last = FlightStateObserver.findLastWaypoint(fp);
            const active = fp?.getWaypoint(fp.activeWaypointIndex);
            const next = fp?.getWaypoint(fp.activeWaypointIndex + 1);

            this.updatePresentPosition();
            this.updateFcu();

            if (last) {
                if (!this.LastWaypoint || last.ident !== this.LastWaypoint.ident) {
                    this.LastWaypoint = new Waypoint(last.ident);
                    this.LastWaypoint.utc = last.waypointReachedAt;
                    this.LastWaypoint.altitude = this.PresentPosition.altitude;
                }
            }

            if (active && next) {
                const ppos = {
                    lat: this.PresentPosition.lat,
                    long: this.PresentPosition.lon,
                };
                const stats = fp.computeWaypointStatistics(ppos);

                if (!this.ActiveWaypoint || this.ActiveWaypoint.ident !== active.ident) {
                    this.ActiveWaypoint = new Waypoint(active.ident);
                }
                this.ActiveWaypoint.utc = Math.round(stats.get(fp.activeWaypointIndex).etaFromPpos);

                if (!this.NextWaypoint || this.NextWaypoint.ident !== next.ident) {
                    this.NextWaypoint = new Waypoint(next.ident);
                }
            }
        }, 1000);
    }
}
