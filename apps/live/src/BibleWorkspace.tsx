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
  text?: string;
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

interface ParsedReference {
  bookLabel: string;
  chapter: number;
  verse?: number;
}

interface PreviousSong {
  providerId: string;
  songId: string;
  title: string;
  slideIndex: number;
}

function optionalText(item: Record<string, unknown>): string | undefined {
  for (const key of ['text', 'content', 'verse_text', 'verseText', 'value']) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
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
            reference: String(verse.reference || ''),
            text: optionalText(verse)
          };
        })
        .filter(verse => verse.id || verse.reference)
    : [];

  if (!verses.length && (item.id || item.reference)) {
    verses.push({
      id: String(item.id || ''),
      book: typeof item.book === 'number' ? item.book : undefined,
      chapter: typeof item.chapter === 'number' ? item.chapter : undefined,
      verse: typeof item.verse === 'number' ? item.verse : undefined,
      reference: String(item.reference || ''),
      text: optionalText(item)
    });
  }

  const reference = String(
    item.reference ||
    verses.map(verse => verse.reference).filter(Boolean).join(', ') ||
    ids[0] ||
    ''
  ).trim();
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

function parseReference(value: string): ParsedReference | null {
  const normalized = value
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const match = normalized.match(
    /^((?:[1-3]\s*)?[\p{L}.ªº]+(?:\s+[\p{L}.ªº]+)*)\s+(\d+)(?:(?:\s*[:.]\s*|\s+)(\d+))?/iu
  );
  if (!match) return null;
  const chapter = Number(match[2]);
  const verse = match[3] ? Number(match[3]) : undefined;
  if (!Number.isFinite(chapter) || chapter <= 0) return null;
  return {
    bookLabel: match[1]!.trim(),
    chapter,
    verse: verse && Number.isFinite(verse) ? verse : undefined
  };
}

function flattenVerses(matches: BibleReferenceMatch[]): BibleVerseReference[] {
  const verses = matches.flatMap(match =>
    match.verses.length
      ? match.verses
      : [{
          id: match.ids[0] || '',
          reference: match.reference
        }]
  );
  const seen = new Set<string>();
  return verses.filter(verse => {
    const key = verse.id || verse.reference.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function verseAsMatch(verse: BibleVerseReference): BibleReferenceMatch {
  return {
    reference: verse.reference,
    ids: verse.id ? [verse.id] : [],
    verses: [verse]
  };
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

function slideText(slide: Record<string, unknown> | undefined): string {
  if (!slide) return '';
  for (const key of ['text', 'content', 'value']) {
    const value = slide[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function slideReference(
  slide: Record<string, unknown> | undefined,
  presentation: Record<string, unknown> | null
): string {
  if (slide) {
    for (const key of ['slide_description', 'description', 'reference']) {
      const value = slide[key];
      if (typeof value === 'string' && parseReference(value)) return value.trim();
    }
  }
  const name = String(presentation?.name || presentation?.title || '').trim();
  return parseReference(name) ? name : '';
}

export function BibleWorkspace({
  controller,
  actorId,
  liveSessionId,
  externalQuery,
  externalQueryNonce,
  currentPresentationProviderId,
  onPresentation
}: {
  controller: Controller;
  actorId: string;
  liveSessionId: string;
  externalQuery?: string;
  externalQueryNonce?: number;
  currentPresentationProviderId?: string | null;
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
  const [busy, setBusy] = useState<'search' | 'chapter' | 'take' | 'return' | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [chapterContext, setChapterContext] = useState<ParsedReference | null>(null);
  const [chapterVerses, setChapterVerses] = useState<BibleVerseReference[]>([]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [multiKeys, setMultiKeys] = useState<Set<string>>(() => new Set());
  const [previousSong, setPreviousSong] = useState<PreviousSong | null>(null);
  const versionsLoadStarted = useRef(false);
  const loadedChapterSignature = useRef('');
  const tapTarget = useRef<{ key: string; at: number } | null>(null);

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

  const livePresentationEntry = useMemo(() => {
    for (const provider of providers) {
      const presentation = provider.observed?.currentPresentation;
      if (presentation && typeof presentation === 'object') {
        return {
          providerId: provider.providerId,
          presentation: presentation as Record<string, unknown>
        };
      }
    }
    return null;
  }, [providers]);

  const livePresentation = livePresentationEntry?.presentation || null;
  const liveSlides = Array.isArray(livePresentation?.slides)
    ? livePresentation.slides as Array<Record<string, unknown>>
    : [];
  const liveSlideNumber = Number(livePresentation?.slide_number);
  const liveSlideIndex = Number.isFinite(liveSlideNumber) && liveSlideNumber > 0
    ? liveSlideNumber - 1
    : 0;
  const liveSlide = liveSlides[liveSlideIndex];
  const liveReference = slideReference(liveSlide, livePresentation);
  const liveParsed = parseReference(liveReference);
  const liveType = String(livePresentation?.type || livePresentation?.slide_type || '');
  const isBibleLive = Boolean(
    liveParsed ||
    /bible|verse|bíblia|biblia/i.test(liveType)
  );
  const liveVerseText = isBibleLive ? slideText(liveSlide) : '';

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
    setVersionsLoading(true);
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
      if (!cancelled) setVersionsLoading(false);
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

  async function performSearch(textInput: string, selectFirst = true) {
    const text = textInput.trim();
    if (!text || busy) return [] as BibleReferenceMatch[];
    setBusy('search');
    setMessage(null);
    try {
      if (!canSearch) {
        const direct = { reference: text, ids: [], verses: [] };
        setResults([direct]);
        if (selectFirst) setSelected(direct);
        return [direct];
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
        setMessage(t('bibleWorkspace.errors.search', {
          code: failed.errorCode || 'provider_error'
        }));
        return [];
      }

      const matches = getBibleMatches(response);
      setResults(matches);
      if (selectFirst) setSelected(matches[0] || null);
      if (!matches.length) setMessage(t('bibleWorkspace.notFound'));
      return matches;
    } catch (error) {
      setMessage(t('bibleWorkspace.errors.search', {
        code: error instanceof Error ? error.message : 'unknown'
      }));
      return [];
    } finally {
      setBusy(null);
    }
  }

  async function search() {
    const text = query.trim();
    if (!text) return;
    setView('search');
    const matches = await performSearch(text);
    const parsed = parseReference(matches[0]?.reference || text);
    if (parsed) void loadChapter(parsed);
  }

  async function loadChapter(reference: ParsedReference) {
    if (!canSearch || busy) {
      setChapterContext(reference);
      return;
    }
    const signature = `${reference.bookLabel.toLocaleLowerCase()}:${reference.chapter}:${version}`;
    if (loadedChapterSignature.current === signature && chapterVerses.length) {
      setChapterContext(reference);
      return;
    }

    setBusy('chapter');
    setMessage(null);
    try {
      const response = await controller.executeCommand({
        capability: 'bible.search',
        payload: { text: `${reference.bookLabel} ${reference.chapter}` },
        liveSessionId,
        actorId,
        safetyLevel: 'normal'
      });
      const failed = response.find(result => !result.accepted);
      if (failed) {
        setMessage(t('bibleWorkspace.errors.chapter', {
          code: failed.errorCode || 'provider_error'
        }));
        setChapterContext(reference);
        return;
      }
      const matches = getBibleMatches(response);
      let verses = flattenVerses(matches);

      // Some provider versions return the chapter as presentation-like rows,
      // while others only identify references. Enrich from observed slides
      // whenever the live presentation belongs to the same chapter.
      if (
        isBibleLive &&
        liveParsed &&
        liveParsed.bookLabel.toLocaleLowerCase() === reference.bookLabel.toLocaleLowerCase() &&
        liveParsed.chapter === reference.chapter &&
        liveSlides.length
      ) {
        const observed = liveSlides.map((slide, index) => {
          const ref = slideReference(slide, livePresentation) ||
            `${reference.bookLabel} ${reference.chapter}:${index + 1}`;
          return {
            id: '',
            reference: ref,
            text: slideText(slide)
          } satisfies BibleVerseReference;
        });
        const byReference = new Map(
          observed.map(item => [item.reference.toLocaleLowerCase(), item])
        );
        verses = verses.map(verse => ({
          ...verse,
          text: verse.text || byReference.get(verse.reference.toLocaleLowerCase())?.text
        }));
        if (!verses.length) verses = observed;
      }

      setChapterContext(reference);
      setChapterVerses(verses);
      setMultiKeys(new Set());
      loadedChapterSignature.current = signature;
    } catch (error) {
      setChapterContext(reference);
      setMessage(t('bibleWorkspace.errors.chapter', {
        code: error instanceof Error ? error.message : 'unknown'
      }));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!liveParsed || !isBibleLive) return;
    const current = chapterContext;
    const sameChapter =
      current &&
      current.bookLabel.toLocaleLowerCase() === liveParsed.bookLabel.toLocaleLowerCase() &&
      current.chapter === liveParsed.chapter;
    if (!sameChapter) void loadChapter(liveParsed);
    // liveReference changes only when the observed Bible frame changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveReference]);

  useEffect(() => {
    if (!externalQuery || !externalQueryNonce) return;
    setQuery(externalQuery);
    setView('search');
    void (async () => {
      const matches = await performSearch(externalQuery);
      const parsed = parseReference(matches[0]?.reference || externalQuery);
      if (parsed) void loadChapter(parsed);
    })();
    // nonce intentionally turns repeated same-query commands into a new action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalQueryNonce]);

  async function putOnAir(match: BibleReferenceMatch) {
    if (!canPresent || busy) return;
    setBusy('take');
    setMessage(null);
    try {
      if (
        !isBibleLive &&
        livePresentation?.song_id &&
        (currentPresentationProviderId || livePresentationEntry?.providerId)
      ) {
        setPreviousSong({
          providerId: currentPresentationProviderId || livePresentationEntry!.providerId,
          songId: String(livePresentation.song_id),
          title: String(livePresentation.name || livePresentation.title || t('liveControls.song')),
          slideIndex: Math.max(0, liveSlideIndex)
        });
      }

      const selectedVersion = versions.find(item =>
        item.key === version || item.version === version
      );
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
        setMessage(t('bibleWorkspace.errors.take', {
          code: failed.errorCode || 'provider_error'
        }));
        return;
      }

      setSelected(match);
      saveHistory(match);
      const presentation = presentationFromResults(response);
      if (presentation) onPresentation?.(presentation);
      setMessage(t('bibleWorkspace.onAir', { reference: match.reference }));
      const parsed = parseReference(match.reference);
      if (parsed) {
        setChapterContext(parsed);
        if (!chapterVerses.length) void loadChapter(parsed);
      }
    } catch (error) {
      setMessage(t('bibleWorkspace.errors.take', {
        code: error instanceof Error ? error.message : 'unknown'
      }));
    } finally {
      setBusy(null);
    }
  }

  async function putSelectedVerses() {
    const selectedVerses = chapterVerses.filter(verse =>
      multiKeys.has(verse.id || verse.reference)
    );
    if (!selectedVerses.length) return;
    const reference = selectedVerses.map(verse => verse.reference).join(', ');
    await putOnAir({
      reference,
      ids: selectedVerses.map(verse => verse.id).filter(Boolean),
      verses: selectedVerses
    });
  }

  async function returnToPreviousSong() {
    if (!previousSong || busy) return;
    setBusy('return');
    setMessage(null);
    try {
      const response = await controller.executeCommand({
        capability: 'songs.present',
        payload: {
          id: previousSong.songId,
          initialIndex: previousSong.slideIndex
        },
        liveSessionId,
        actorId,
        targetProviderIds: [previousSong.providerId],
        safetyLevel: 'normal'
      });
      const failed = response.find(result => !result.accepted);
      if (failed) {
        setMessage(t('bibleWorkspace.errors.returnSong', {
          code: failed.errorCode || 'provider_error'
        }));
        return;
      }
      const presentation = presentationFromResults(response);
      if (presentation) onPresentation?.(presentation);
      setMessage(t('bibleWorkspace.returnedToSong', { title: previousSong.title }));
    } catch (error) {
      setMessage(t('bibleWorkspace.errors.returnSong', {
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
    const parsed = parseReference(item.reference);
    if (parsed) void loadChapter(parsed);
  }

  function activateVerse(verse: BibleVerseReference) {
    const key = verse.id || verse.reference;
    if (multiSelect) {
      setMultiKeys(current => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }

    const now = performance.now();
    const previous = tapTarget.current;
    if (previous?.key === key && now - previous.at <= 380) {
      tapTarget.current = null;
      void putOnAir(verseAsMatch(verse));
      return;
    }
    tapTarget.current = { key, at: now };
    setSelected(verseAsMatch(verse));
  }

  async function moveVerse(delta: -1 | 1) {
    const reference = liveParsed || parseReference(selected?.reference || '');
    if (!reference) return;

    const currentVerse = liveParsed?.verse || reference.verse;
    const currentIndex = chapterVerses.findIndex(verse => {
      const parsed = parseReference(verse.reference);
      return Boolean(
        parsed &&
        parsed.bookLabel.toLocaleLowerCase() === reference.bookLabel.toLocaleLowerCase() &&
        parsed.chapter === reference.chapter &&
        parsed.verse === currentVerse
      );
    });
    const candidate = currentIndex >= 0 ? chapterVerses[currentIndex + delta] : undefined;
    if (candidate) {
      await putOnAir(verseAsMatch(candidate));
      return;
    }

    if (currentVerse && currentVerse + delta > 0) {
      await putOnAir({
        reference: `${reference.bookLabel} ${reference.chapter}:${currentVerse + delta}`,
        ids: [],
        verses: []
      });
    }
  }

  async function moveChapter(delta: -1 | 1) {
    if (!chapterContext) return;
    const nextChapter = chapterContext.chapter + delta;
    if (nextChapter <= 0) return;
    const next = {
      bookLabel: chapterContext.bookLabel,
      chapter: nextChapter
    };
    setQuery(`${next.bookLabel} ${next.chapter}`);
    loadedChapterSignature.current = '';
    await loadChapter(next);
  }

  const collection = view === 'favorites' ? favorites : history;
  const effectiveChapter = chapterContext || liveParsed;
  const activeVerseReference = liveReference || selected?.reference || '';

  return (
    <article className="operator-card live-tool-card bible-workspace bible-reader-workspace">
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
            onChange={event => {
              setVersion(event.target.value);
              loadedChapterSignature.current = '';
            }}
            disabled={!canPresent || versionsLoading || busy === 'take'}
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

      <section className={isBibleLive ? 'bible-live-strip active' : 'bible-live-strip'}>
        <div className="bible-live-status">
          <span />
          <div>
            <small>{isBibleLive ? t('bibleWorkspace.onAirNow') : t('bibleWorkspace.liveContext')}</small>
            <strong>{isBibleLive
              ? liveReference || String(livePresentation?.name || t('bibleWorkspace.bibleOnAir'))
              : t('bibleWorkspace.noBibleOnAir')}</strong>
          </div>
        </div>
        {isBibleLive && liveVerseText && <p>{liveVerseText}</p>}
        {previousSong && (
          <button
            type="button"
            className="bible-return-song"
            disabled={busy !== null}
            onClick={() => void returnToPreviousSong()}
          >
            ← {t('bibleWorkspace.returnToSong', { title: previousSong.title })}
          </button>
        )}
      </section>

      <div className="bible-search-command">
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
            className="primary"
            type="button"
            disabled={!query.trim() || !canPresent || busy !== null}
            onClick={() => void search()}
          >
            {busy === 'search' ? t('bibleWorkspace.searching') : t('bibleWorkspace.goToPassage')}
          </button>
        </div>
        <small>{t('bibleWorkspace.searchExamples')}</small>
      </div>

      {effectiveChapter && (
        <section className="bible-chapter-reader">
          <header className="bible-chapter-nav">
            <button
              type="button"
              disabled={busy !== null || effectiveChapter.chapter <= 1}
              onClick={() => void moveChapter(-1)}
            >
              ← {t('bibleWorkspace.previousChapter')}
            </button>
            <div>
              <small>{t('bibleWorkspace.chapter')}</small>
              <strong>{effectiveChapter.bookLabel} {effectiveChapter.chapter}</strong>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void moveChapter(1)}
            >
              {t('bibleWorkspace.nextChapter')} →
            </button>
          </header>

          <div className="bible-reader-actions">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void moveVerse(-1)}
            >
              ← {t('bibleWorkspace.previousVerse')}
            </button>
            <button
              type="button"
              className={multiSelect ? 'active' : ''}
              onClick={() => {
                setMultiSelect(value => !value);
                setMultiKeys(new Set());
              }}
            >
              {multiSelect
                ? t('bibleWorkspace.cancelMulti')
                : t('bibleWorkspace.selectMultiple')}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void moveVerse(1)}
            >
              {t('bibleWorkspace.nextVerse')} →
            </button>
          </div>

          <div className="bible-verse-reader" aria-live="polite">
            {busy === 'chapter' && (
              <div className="bible-chapter-loading">{t('bibleWorkspace.loadingChapter')}</div>
            )}
            {chapterVerses.map((verse, index) => {
              const key = verse.id || verse.reference;
              const onAir = Boolean(
                isBibleLive &&
                activeVerseReference &&
                (
                  verse.reference.toLocaleLowerCase() === activeVerseReference.toLocaleLowerCase() ||
                  (
                    parseReference(verse.reference)?.verse &&
                    parseReference(verse.reference)?.verse === liveParsed?.verse
                  )
                )
              );
              const selectedVerse = multiKeys.has(key);
              return (
                <button
                  key={key || index}
                  type="button"
                  className={[
                    'bible-verse-row',
                    onAir ? 'on-air' : '',
                    selectedVerse ? 'selected' : ''
                  ].filter(Boolean).join(' ')}
                  onClick={() => activateVerse(verse)}
                  disabled={busy === 'take' || busy === 'return'}
                >
                  <span className="bible-verse-number">
                    {parseReference(verse.reference)?.verse || verse.verse || index + 1}
                  </span>
                  <span className="bible-verse-copy">
                    <small>{verse.reference}</small>
                    <strong>{verse.text || t('bibleWorkspace.verseReady')}</strong>
                  </span>
                  <em>
                    {onAir
                      ? t('bibleWorkspace.onAirBadge')
                      : selectedVerse
                        ? t('bibleWorkspace.selected')
                        : t('bibleWorkspace.preview')}
                  </em>
                </button>
              );
            })}
            {!chapterVerses.length && busy !== 'chapter' && (
              <div className="bible-chapter-empty">
                <strong>{t('bibleWorkspace.chapterReferencesUnavailable')}</strong>
                <span>{t('bibleWorkspace.chapterReferencesFallback')}</span>
              </div>
            )}
          </div>

          {multiSelect && multiKeys.size > 0 && (
            <div className="bible-multi-take">
              <span>{t('bibleWorkspace.selectedCount', { count: multiKeys.size })}</span>
              <button
                type="button"
                className="primary"
                disabled={busy !== null}
                onClick={() => void putSelectedVerses()}
              >
                {t('bibleWorkspace.showSelected', { count: multiKeys.size })}
              </button>
            </div>
          )}
        </section>
      )}

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
        <div className="bible-results bible-quick-results" aria-live="polite">
          {results.map(match => {
            const key = savedKey(match);
            const active = selected ? savedKey(selected) === key : false;
            return (
              <section key={key} className={`bible-result-card ${active ? 'selected' : ''}`}>
                <button
                  type="button"
                  className="bible-result-main"
                  onClick={() => {
                    setSelected(match);
                    const parsed = parseReference(match.reference);
                    if (parsed) void loadChapter(parsed);
                  }}
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
