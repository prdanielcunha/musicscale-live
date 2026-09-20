import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CommandResult } from '@millionsnest/live-domain';
import type { useLiveNode } from './useLiveNode';

type Controller = ReturnType<typeof useLiveNode>;

interface BibleVerseReference {
  id: string;
  book?: number;
  chapter?: number;
  verse?: number;
  reference: string;
}

interface BibleReferenceMatch {
  reference: string;
  ids: string[];
  verses: BibleVerseReference[];
}

interface BibleVersion {
  key: string;
  version: string;
  title: string;
  languageId?: string;
  languageIso?: string;
}

interface SavedBibleReference extends BibleReferenceMatch {
  version?: string;
  savedAt: string;
}

function normalizeMatch(value: unknown): BibleReferenceMatch | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const ids = Array.isArray(item.ids)
    ? item.ids.map(String).filter(Boolean)
    : item.id
      ? [String(item.id)]
      : [];
  const verses = Array.isArray(item.verses)
    ? item.verses
        .filter(candidate => candidate && typeof candidate === 'object')
        .map(candidate => {
          const verse = candidate as Record<string, unknown>;
          return {
            id: String(verse.id || ''),
            book: typeof verse.book === 'number' ? verse.book : undefined,
            chapter: typeof verse.chapter === 'number' ? verse.chapter : undefined,
            verse: typeof verse.verse === 'number' ? verse.verse : undefined,
            reference: String(verse.reference || '')
          };
        })
        .filter(verse => verse.id || verse.reference)
    : [];

  const reference = String(item.reference || verses.map(verse => verse.reference).filter(Boolean).join(', ') || ids[0] || '').trim();
  if (!reference && ids.length === 0) return null;
  return { reference, ids, verses };
}

function getBibleMatches(results: CommandResult[]): BibleReferenceMatch[] {
  const normalized: BibleReferenceMatch[] = [];
  for (const result of results) {
    const raw = result.observedState?.matches;
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const value of values) {
      const match = normalizeMatch(value);
      if (match) normalized.push(match);
    }
  }

  const seen = new Set<string>();
  return normalized.filter(match => {
    const key = match.ids.join('|') || match.reference.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getBibleVersions(results: CommandResult[]): BibleVersion[] {
  const values = results.flatMap(result => {
    const raw = result.observedState?.versions;
    return Array.isArray(raw) ? raw : [];
  });

  const versions = values
    .filter(value => value && typeof value === 'object')
    .map(value => {
      const item = value as Record<string, unknown>;
      const language = item.language && typeof item.language === 'object'
        ? item.language as Record<string, unknown>
        : {};
      const key = String(item.key || item.version || '');
      const version = String(item.version || item.key || '');
      return {
        key,
        version,
        title: String(item.title || version || key),
        languageId: language.id ? String(language.id) : undefined,
        languageIso: language.iso ? String(language.iso) : undefined
      };
    })
    .filter(item => item.key && item.version);

  const seen = new Set<string>();
  return versions.filter(item => {
    const key = `${item.key}:${item.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function presentationFromResults(results: CommandResult[]): Record<string, unknown> | null {
  for (const result of results) {
    const presentation = result.observedState?.currentPresentation;
    if (presentation && typeof presentation === 'object') {
      return presentation as Record<string, unknown>;
    }
  }
  return null;
}

function readStoredReferences(key: string): SavedBibleReference[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item && typeof item === 'object' && typeof item.reference === 'string')
      .slice(0, 50) as SavedBibleReference[];
  } catch {
    return [];
  }
}

function writeStoredReferences(key: string, value: SavedBibleReference[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value.slice(0, 50)));
  } catch {
    // Local operation must keep working even when storage is unavailable.
  }
}

function savedKey(item: Pick<BibleReferenceMatch, 'reference' | 'ids'>): string {
  return item.ids.join('|') || item.reference.trim().toLocaleLowerCase();
}

export function BibleWorkspace({
  controller,
  actorId,
  liveSessionId,
  onPresentation
}: {
  controller: Controller;
  actorId: string;
  liveSessionId: string;
  onPresentation?: (presentation: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BibleReferenceMatch[]>([]);
  const [selected, setSelected] = useState<BibleReferenceMatch | null>(null);
  const [versions, setVersions] = useState<BibleVersion[]>([]);
  const [version, setVersion] = useState('');
  const [favorites, setFavorites] = useState<SavedBibleReference[]>([]);
  const [history, setHistory] = useState<SavedBibleReference[]>([]);
  const [view, setView] = useState<'search' | 'favorites' | 'history'>('search');
  const [busy, setBusy] = useState<'search' | 'versions' | 'take' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const versionsLoadStarted = useRef(false);

  const providers = controller.nodeState?.providers || [];
  const capabilitySet = useMemo(
    () => new Set(
      providers
        .filter(provider => provider.health === 'online' || provider.health === 'degraded')
        .flatMap(provider => provider.capabilities)
    ),
    [providers]
  );
  const canSearch = capabilitySet.has('bible.search');
  const canPresent = capabilitySet.has('bible.present');
  const canReadVersions = capabilitySet.has('bible.versions.read');

  const binding = controller.credential?.binding;
  const storageScope = binding
    ? `${binding.organizationId}:${binding.venueId}`
    : 'local';
  const favoritesKey = `musicscale-live:bible:favorites:${storageScope}`;
  const historyKey = `musicscale-live:bible:history:${storageScope}`;

  useEffect(() => {
    setFavorites(readStoredReferences(favoritesKey));
    setHistory(readStoredReferences(historyKey));
  }, [favoritesKey, historyKey]);

  useEffect(() => {
    if (!canReadVersions || versionsLoadStarted.current) return;
    versionsLoadStarted.current = true;
    let cancelled = false;
    setBusy(current => current || 'versions');
    void controller.executeCommand({
      capability: 'bible.versions.read',
      payload: {},
      liveSessionId,
      actorId,
      safetyLevel: 'normal'
    }).then(response => {
      if (cancelled) return;
      setVersions(getBibleVersions(response));
    }).catch(() => {
      // Version selection is progressive enhancement; the provider default remains usable.
    }).finally(() => {
      if (!cancelled) setBusy(current => current === 'versions' ? null : current);
    });
    return () => {
      cancelled = true;
    };
  }, [actorId, canReadVersions, controller.executeCommand, liveSessionId]);

  const favoriteKeys = useMemo(
    () => new Set(favorites.map(item => savedKey(item))),
    [favorites]
  );

  function saveHistory(match: BibleReferenceMatch) {
    const entry: SavedBibleReference = {
      ...match,
      version: version || undefined,
      savedAt: new Date().toISOString()
    };
    setHistory(current => {
      const key = savedKey(entry);
      const next = [entry, ...current.filter(item => savedKey(item) !== key)].slice(0, 40);
      writeStoredReferences(historyKey, next);
      return next;
    });
  }

  function toggleFavorite(match: BibleReferenceMatch) {
    const key = savedKey(match);
    setFavorites(current => {
      const exists = current.some(item => savedKey(item) === key);
      const next = exists
        ? current.filter(item => savedKey(item) !== key)
        : [{
            ...match,
            version: version || undefined,
            savedAt: new Date().toISOString()
          }, ...current].slice(0, 30);
      writeStoredReferences(favoritesKey, next);
      return next;
    });
  }

  async function search() {
    const text = query.trim();
    if (!text || busy) return;
    setBusy('search');
    setMessage(null);
    try {
      if (!canSearch) {
        const direct = { reference: text, ids: [], verses: [] };
        setResults([direct]);
        setSelected(direct);
        return;
      }

      const response = await controller.executeCommand({
        capability: 'bible.search',
        payload: { text },
        liveSessionId,
        actorId,
        safetyLevel: 'normal'
      });
      const failed = response.find(result => !result.accepted);
      if (failed) {
        setMessage(t('bibleWorkspace.errors.search', { code: failed.errorCode || 'provider_error' }));
        return;
      }

      const matches = getBibleMatches(response);
      setResults(matches);
      setSelected(matches[0] || null);
      if (!matches.length) setMessage(t('bibleWorkspace.notFound'));
    } catch (error) {
      setMessage(t('bibleWorkspace.errors.search', {
        code: error instanceof Error ? error.message : 'unknown'
      }));
    } finally {
      setBusy(null);
    }
  }

  async function putOnAir(match: BibleReferenceMatch) {
    if (!canPresent || busy) return;
    setBusy('take');
    setMessage(null);
    try {
      const selectedVersion = versions.find(item => item.key === version || item.version === version);
      const payload: Record<string, unknown> = match.ids.length
        ? { ids: match.ids }
        : { references: match.reference };
      if (selectedVersion) payload.version = selectedVersion.version;

      const response = await controller.executeCommand({
        capability: 'bible.present',
        payload,
        liveSessionId,
        actorId,
        safetyLevel: 'normal'
      });
      const failed = response.find(result => !result.accepted);
      if (failed) {
        setMessage(t('bibleWorkspace.errors.take', { code: failed.errorCode || 'provider_error' }));
        return;
      }

      setSelected(match);
      saveHistory(match);
      const presentation = presentationFromResults(response);
      if (presentation) onPresentation?.(presentation);
      setMessage(t('bibleWorkspace.onAir', { reference: match.reference }));
    } catch (error) {
      setMessage(t('bibleWorkspace.errors.take', {
        code: error instanceof Error ? error.message : 'unknown'
      }));
    } finally {
      setBusy(null);
    }
  }

  function reuse(item: SavedBibleReference) {
    setQuery(item.reference);
    setSelected(item);
    setResults([item]);
    if (item.version && versions.some(candidate =>
      candidate.key === item.version || candidate.version === item.version
    )) {
      setVersion(item.version);
    }
    setView('search');
  }

  const collection = view === 'favorites' ? favorites : history;

  return (
    <article className="operator-card live-tool-card bible-workspace">
      <div className="bible-workspace-head">
        <div>
          <span className="eyebrow">{t('bibleWorkspace.kicker')}</span>
          <strong>{t('bibleWorkspace.title')}</strong>
          <small>{t('bibleWorkspace.subtitle')}</small>
        </div>
        <div className="bible-version-control">
          <label htmlFor="live-bible-version">{t('bibleWorkspace.version')}</label>
          <select
            id="live-bible-version"
            value={version}
            onChange={event => setVersion(event.target.value)}
            disabled={!canPresent || busy === 'take'}
          >
            <option value="">{t('bibleWorkspace.providerDefault')}</option>
            {versions.map(item => (
              <option key={`${item.key}:${item.version}`} value={item.key}>
                {item.title}{item.languageIso ? ` · ${item.languageIso.toUpperCase()}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bible-view-tabs" role="tablist" aria-label={t('bibleWorkspace.library')}>
        {(['search', 'favorites', 'history'] as const).map(item => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={view === item}
            className={view === item ? 'active' : ''}
            onClick={() => setView(item)}
          >
            <span>{t(`bibleWorkspace.tabs.${item}`)}</span>
            {item === 'favorites' && favorites.length > 0 && <b>{favorites.length}</b>}
            {item === 'history' && history.length > 0 && <b>{history.length}</b>}
          </button>
        ))}
      </div>

      {view === 'search' ? (
        <>
          <div className="bible-search-row">
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void search();
              }}
              placeholder={t('bibleWorkspace.placeholder')}
              disabled={!canPresent}
              autoCapitalize="sentences"
            />
            <button
              className="secondary"
              type="button"
              disabled={!query.trim() || !canPresent || busy !== null}
              onClick={() => void search()}
            >
              {busy === 'search' ? t('bibleWorkspace.searching') : t('bibleWorkspace.search')}
            </button>
          </div>

          <div className="bible-results" aria-live="polite">
            {results.map(match => {
              const key = savedKey(match);
              const active = selected ? savedKey(selected) === key : false;
              return (
                <section key={key} className={`bible-result-card ${active ? 'selected' : ''}`}>
                  <button
                    type="button"
                    className="bible-result-main"
                    onClick={() => setSelected(match)}
                  >
                    <span>
                      <strong>{match.reference}</strong>
                      <small>
                        {match.ids.length
                          ? t('bibleWorkspace.verseCount', { count: match.ids.length })
                          : t('bibleWorkspace.referenceReady')}
                      </small>
                    </span>
                    <em>{active ? t('bibleWorkspace.ready') : t('bibleWorkspace.preview')}</em>
                  </button>

                  {active && (
                    <div className="bible-result-detail">
                      {match.verses.length > 0 && (
                        <div className="bible-verse-chips">
                          {match.verses.map(verse => (
                            <span key={verse.id || verse.reference}>{verse.reference}</span>
                          ))}
                        </div>
                      )}
                      <div className="bible-result-actions">
                        <button
                          type="button"
                          className={favoriteKeys.has(key) ? 'bible-favorite active' : 'bible-favorite'}
                          aria-pressed={favoriteKeys.has(key)}
                          onClick={() => toggleFavorite(match)}
                        >
                          {favoriteKeys.has(key)
                            ? t('bibleWorkspace.removeFavorite')
                            : t('bibleWorkspace.addFavorite')}
                        </button>
                        <button
                          type="button"
                          className="primary bible-take"
                          disabled={!canPresent || busy !== null}
                          onClick={() => void putOnAir(match)}
                        >
                          {busy === 'take'
                            ? t('bibleWorkspace.sending')
                            : t('bibleWorkspace.putOnAir')}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}

            {query.trim() && results.length === 0 && busy !== 'search' && !message && (
              <div className="bible-empty">{t('bibleWorkspace.searchHint')}</div>
            )}
          </div>
        </>
      ) : (
        <div className="bible-saved-list">
          {collection.length ? collection.map(item => {
            const key = `${savedKey(item)}:${item.savedAt}`;
            return (
              <button key={key} type="button" onClick={() => reuse(item)}>
                <span>
                  <strong>{item.reference}</strong>
                  <small>
                    {item.version || t('bibleWorkspace.providerDefault')}
                    {' · '}
                    {new Date(item.savedAt).toLocaleString()}
                  </small>
                </span>
                <em>{t('bibleWorkspace.useAgain')}</em>
              </button>
            );
          }) : (
            <div className="bible-empty">
              {view === 'favorites'
                ? t('bibleWorkspace.noFavorites')
                : t('bibleWorkspace.noHistory')}
            </div>
          )}
        </div>
      )}

      {!canSearch && canPresent && (
        <p className="bible-capability-note">{t('bibleWorkspace.directReferenceOnly')}</p>
      )}
      {message && <p className="bible-workspace-message" role="status">{message}</p>}
    </article>
  );
}
