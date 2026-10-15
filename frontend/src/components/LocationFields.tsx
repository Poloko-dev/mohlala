import { useAreas } from '../api/queries'

interface LocationFieldsProps {
  lat: string
  lon: string
  onChange: (lat: string, lon: string) => void
  /** Sub-district selector; omitted when the caller has no use for it. */
  pcode?: string
  onPcodeChange?: (pcode: string) => void
}

/** Latitude and longitude inputs (also filled by clicking the map), with an optional sub-district override. */
export function LocationFields({ lat, lon, onChange, pcode, onPcodeChange }: LocationFieldsProps) {
  const { data: areas } = useAreas()
  return (
    <>
      <div className="fields">
        <label className="field">
          <span>Latitude</span>
          <input type="number" step="any" inputMode="decimal" required placeholder="-29.3151" value={lat}
                 onChange={(e) => onChange(e.target.value, lon)} />
        </label>
        <label className="field">
          <span>Longitude</span>
          <input type="number" step="any" inputMode="decimal" required placeholder="27.4869" value={lon}
                 onChange={(e) => onChange(lat, e.target.value)} />
        </label>
      </div>
      {onPcodeChange && (
        <label className="field">
          <span>Sub-district</span>
          <select value={pcode ?? ''} onChange={(e) => onPcodeChange(e.target.value)}>
            <option value="">That of the nearest mapped POI (default)</option>
            {areas?.map((a) => (
              <option key={a.adm2_pcode} value={a.adm2_pcode}>
                {a.sub_district} · {a.district} ({a.adm2_pcode})
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  )
}
