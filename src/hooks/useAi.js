import { useEffect, useState } from 'react';
import api from '../api/client';

// Is the server's OpenAI key set? Asked once per page load; every AI button is hidden when it is not.
let known = null;
let inflight = null;

export default function useAi() {
  const [enabled, setEnabled] = useState(known === true);
  useEffect(() => {
    if (known !== null) { setEnabled(known); return undefined; }
    if (!inflight) {
      inflight = api.get('/ai/status', { __skipOops: true })
        .then((res) => { known = !!res.data.enabled; })
        .catch(() => { known = false; })
        .finally(() => { inflight = null; });
    }
    let live = true;
    inflight.then(() => { if (live) setEnabled(known === true); });
    return () => { live = false; };
  }, []);
  return enabled;
}
