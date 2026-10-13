import { useState } from 'react'
import { isFreeModel } from '../../supabase/functions/_shared/free.ts'
import type { ModelInfo } from '../lib/types'

const label = (m: ModelInfo) => `${m.name} · ${Math.round(m.context_length / 1000)}k context`

export function ModelPicker(props: { value: string; onChange(id: string): void; models: ModelInfo[]; allowPaid: boolean }) {
  const [query, setQuery] = useState('')
  const [showPaid, setShowPaid] = useState(false)
  const q = query.trim().toLowerCase()
  const visible = props.models.filter(
    (m) => (isFreeModel(m) || (props.allowPaid && showPaid)) && (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)),
  )
  const current = props.models.find((m) => m.id === props.value)
  const options = visible.some((m) => m.id === props.value) ? visible : [current ?? null, ...visible]

  return (
    <div className="model-picker">
      <input type="search" aria-label="Search models" placeholder="Search models" value={query} onChange={(e) => setQuery(e.target.value)} />
      <select id="model-picker" aria-label="Model" value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {options.map((m) => (m ? <option key={m.id} value={m.id}>{label(m)}</option> : <option key={props.value} value={props.value}>{props.value}</option>))}
      </select>
      {props.allowPaid && (
        <label className="inline">
          <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} /> Show paid
        </label>
      )}
    </div>
  )
}
