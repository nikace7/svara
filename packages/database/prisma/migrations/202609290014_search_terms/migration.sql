-- Retrieval compares content words, not question shape. Trigram similarity over whole
-- questions let "What is the tuition fee?" match "Where is the library?" on "is the", and
-- Nepali postpositions ("कक्षको") kept a paraphrase from reaching "कक्ष". Both sides are
-- reduced the same way: punctuation and function/question words are dropped, and Nepali
-- words lose one attached postposition. Symmetry keeps a wrong strip harmless.
-- Punctuation is listed explicitly: [[:punct:]] follows the database locale, which can
-- class the Devanagari virama as punctuation and split "भर्ना" into "भर ना".
CREATE FUNCTION svara_search_terms(value TEXT, locale TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT coalesce(string_agg(term, ' ' ORDER BY position), '') FROM (
    SELECT position, CASE WHEN locale = 'ne'
      THEN coalesce(nullif(regexp_replace(word, '(हरू)?(को|का|की|मा|ले|लाई|बाट|देखि|सम्म|तिर)$', ''), ''), word)
      ELSE word END AS term
    FROM unnest(regexp_split_to_array(
      regexp_replace(value, '[!-/:-@[-`{-~।॥·–—‘’“”]', ' ', 'g'), '\s+')) WITH ORDINALITY AS words(word, position)
    WHERE word <> '' AND word <> ALL (CASE WHEN locale = 'ne' THEN ARRAY[
      'छ','छन्','हो','होइन','हुन्','हुन्छ','हुन्छन्','के','को','कहाँ','कहिले','कति','कुन','कसरी','किन',
      'कस्तो','म','मेरो','मलाई','हामी','तपाईं','तपाईंको','यो','त्यो','यहाँ','र','वा','पनि','नै','लागि',
      'बारे','सक्छु','सक्छ','सक्छन्','सक्नुहुन्छ','गर्ने','गर्न','गर्नुहोस्','हुनुहुन्छ','मा','ले','लाई',
      'बाट','देखि','सम्म','का','की']
    ELSE ARRAY[
      'a','an','the','is','are','was','were','be','am','do','does','did','what','where','when','which',
      'who','whom','whose','why','how','can','could','may','might','will','would','shall','should','i',
      'me','my','you','your','we','our','they','their','it','its','this','that','these','those','there',
      'here','of','to','in','on','at','for','from','by','with','about','as','and','or','please','tell','any',
      's','t']
    END)
  ) AS terms
$$;

ALTER TABLE "ReleaseKnowledge"
  ADD COLUMN "searchTerms" TEXT GENERATED ALWAYS AS (svara_search_terms(
    svara_normalize_knowledge("title" || ' ' || "question" || ' ' || "content"), "locale")) STORED,
  ADD COLUMN "questionTerms" TEXT GENERATED ALWAYS AS (svara_search_terms(
    svara_normalize_knowledge("question"), "locale")) STORED;

DROP INDEX "ReleaseKnowledge_searchText_idx";
DROP INDEX "ReleaseKnowledge_normalizedQuestion_idx";
CREATE INDEX "ReleaseKnowledge_searchTerms_idx" ON "ReleaseKnowledge" USING GIN ("searchTerms" gin_trgm_ops);
CREATE INDEX "ReleaseKnowledge_questionTerms_idx" ON "ReleaseKnowledge" USING GIN ("questionTerms" gin_trgm_ops);
