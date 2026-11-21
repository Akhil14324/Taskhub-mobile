import { useState } from 'react';
import { Chip } from '../kit';
import DueDatePicker from '../DueDatePicker';
import { todayYmd, addDays, formatDayHeader } from '../../utils/dates';

/**
 * The period filter of the monitor screens. A value is a number of days back (7 / 30 / 90) or one day as 'YYYY-MM-DD'
 * (what was completed on that day). `periodParams()` turns it into the API query.
 */
export const periodParams = (value) => (typeof value === 'string' ? { from: value, to: value } : { days: value });

export default function PeriodChips({ value, onChange, ranges = [7, 30, 90] }) {
  const [picker, setPicker] = useState(false);
  const today = todayYmd();
  const yesterday = addDays(today, -1);
  const custom = typeof value === 'string' && value !== today && value !== yesterday;
  return (
    <>
      {ranges.map((r) => <Chip key={r} label={`Last ${r} days`} active={value === r} onPress={() => onChange(r)} />)}
      <Chip label="Today" active={value === today} onPress={() => onChange(today)} />
      <Chip label="Yesterday" active={value === yesterday} onPress={() => onChange(yesterday)} />
      <Chip icon="calendar-outline" label={custom ? formatDayHeader(value) : 'Pick a date'} active={custom} onPress={() => setPicker(true)} />
      <DueDatePicker
        visible={picker}
        onClose={() => setPicker(false)}
        date={custom ? value : null}
        allowTime={false}
        onChange={({ date }) => { if (date) onChange(date); }}
      />
    </>
  );
}
