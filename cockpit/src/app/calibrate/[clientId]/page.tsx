import { requireOperator } from '@/lib/auth'
import { readCalibrationScreen } from '@/lib/matching/calibrate-read'
import { CalibrateView } from '@/components/calibrate/CalibrateView'

/**
 * The calibration conversation. Redrawn 22 Sep 2026 (checkpoint 2): this file
 * signs in and reads (lib/matching/calibrate-read.ts); components/calibrate/
 * draws; the write is record_calibration (0056) through calibrate-core.ts.
 *
 * 🔒 NOTHING IS PRE-FILLED, ever: each sitting is its own record, so the fields
 * start empty and the previous sitting is shown beside them as reference.
 * 🔒 A failed read is shown as failed, never as "not calibrated yet".
 */

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Calibrate({ params, searchParams }: {
  params: Promise<{ clientId: string }>
  searchParams: Promise<{ guardado?: string; jaGuardado?: string; erro?: string; campos?: string }>
}) {
  await requireOperator()
  const { clientId } = await params
  const { guardado, jaGuardado, erro, campos } = await searchParams
  const screen = await readCalibrationScreen(clientId)
  return <CalibrateView clientId={clientId} screen={screen} guardado={guardado} jaGuardado={jaGuardado} erro={erro} campos={campos} />
}
