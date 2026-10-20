import { useCallback, useEffect, useRef, useState } from 'react';

/** Loads data with loading / error state. `fn` is re-run whenever `deps` change or reload() is called. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, error: null, data: undefined, meta: undefined });
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(fn)
      .then((r) => { if (id === seq.current) setState({ loading: false, error: null, data: r?.data, meta: r?.meta }); })
      .catch((e) => { if (id === seq.current && e.name !== 'AbortError') setState((s) => ({ ...s, loading: false, error: e })); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); return () => { seq.current++; }; }, [run]);
  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Simple controlled-form state helper. */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));
  const bind = (name) => ({
    name, value: values[name] ?? '',
    onChange: (e) => set(name, e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e),
    error: errors[name],
  });
  return { values, set, setValues, errors, setErrors, bind, reset: (v = initial) => { setValues(v); setErrors({}); } };
}

export function usePageTitle(title) {
  useEffect(() => { document.title = title ? `${title} · CPMS` : 'CPMS'; }, [title]);
}
