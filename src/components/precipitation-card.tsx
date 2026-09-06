// precipitation-card.tsx — Precipitation tile for the Now page.
//
// Layout: centered flex-column.
//   Rain section (always shown): drop icon + rain today + rain rate.
//   Snow section (only when snow > 0): snowflake icon + snow today + snow rate.
//
// Per ADR-042: dashboard has zero unit knowledge.
//   Rain Today is calculated from archive records and formatted with the
//   configured rain unit; rainRate/snow/snowRate use ConvertedValue.formatted.
//
// DataBag pattern (T0B.2): card self-extracts from dataBag["/api/v1/current"].
// onRetry removed — page container manages data freshness in the DataBag model.

import { useTranslation } from 'react-i18next';
import { asConverted } from '../api/types';
import { getStationDate } from '../utils/station-clock';
import { useArchive, useStation, useTodayStats } from '../hooks/useWeatherData';
import { formatValue } from '../utils/format';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from './ui/card';
import type { Observation, UnitsBlock } from '../api/types';
import type { CardComponentProps } from '../lib/card-registry';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PrecipitationSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted h-20"
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons (Phosphor regular weight, ADR-050).
// ---------------------------------------------------------------------------

function DropIcon({ size = 36 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ color: 'currentColor', opacity: 0.7, flexShrink: 0 }}
      fill="currentColor"
    >
      <path d="M174,47.75a254.19,254.19,0,0,0-41.45-38.3,8,8,0,0,0-9.18,0A254.19,254.19,0,0,0,82,47.75C54.51,79.32,40,112.6,40,144a88,88,0,0,0,176,0C216,112.6,201.49,79.32,174,47.75ZM128,216a72.08,72.08,0,0,1-72-72c0-57.23,55.47-105,72-118,16.53,13,72,60.75,72,118A72.08,72.08,0,0,1,128,216Zm55.89-62.67a57.6,57.6,0,0,1-46.56,46.55A8.75,8.75,0,0,1,136,200a8,8,0,0,1-1.32-15.89c16.57-2.79,30.63-16.85,33.44-33.45a8,8,0,0,1,15.78,2.68Z" />
    </svg>
  );
}

// Phosphor "snowflake" icon (regular weight) — inline SVG per ADR-050.
function SnowflakeIcon({ size = 36 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ color: 'currentColor', opacity: 0.7, flexShrink: 0 }}
      fill="currentColor"
    >
      {/* Phosphor "snowflake" regular — ph:snowflake */}
      <path d="M220,128a8,8,0,0,1-8,8H183.39l16.3,16.3a8,8,0,0,1-11.32,11.31L168,143.31V168a8,8,0,0,1-16,0V148.69l-16.29,16.3a8,8,0,0,1-11.32-11.31L140.69,136H44a8,8,0,0,1,0-16h96.69L124.39,103.7a8,8,0,0,1,11.32-11.31L152,108.69V88a8,8,0,0,1,16,0v24.69l20.38-20.38a8,8,0,0,1,11.32,11.31L183.39,120H212A8,8,0,0,1,220,128ZM88,168a8,8,0,0,0-8,8v11.32L67.31,174.63a8,8,0,0,0-11.32,11.31L68.68,198.63,57.37,209.94a8,8,0,0,0,11.32,11.32L80,210.63V222a8,8,0,0,0,16,0V210.63l11.31,11.31a8,8,0,0,0,11.32-11.32L107.32,198.63l12.69-12.69a8,8,0,0,0-11.32-11.31L96,187.32V176A8,8,0,0,0,88,168ZM198.63,57.37a8,8,0,0,0-11.32,0L176,68.68V57.37a8,8,0,0,0-16,0V80a8,8,0,0,0,8,8h22.63a8,8,0,0,0,0-16H179.32l11.31-11.31a8,8,0,0,0,0-11.32ZM57.37,80.69A8,8,0,0,0,68.68,69.38L80,58.06V80a8,8,0,0,0,16,0V34a8,8,0,0,0-8-8H42a8,8,0,0,0,0,16H57.37L46.06,53.38a8,8,0,1,0,11.31,11.31Z" />
    </svg>
  );
}


// Phosphor "drop-half" icon (regular weight) — inline SVG per ADR-050.
function DropHalfIcon({ size = 36 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ color: 'currentColor', opacity: 0.7, flexShrink: 0 }}
      fill="currentColor"
    >
      <path d="M174,47.75a254.19,254.19,0,0,0-41.45-38.3,8,8,0,0,0-9.18,0A254.19,254.19,0,0,0,82,47.75C54.51,79.32,40,112.6,40,144a88,88,0,0,0,176,0C216,112.6,201.49,79.32,174,47.75ZM56,144c0-57.23,55.47-105,72-118V216A72.08,72.08,0,0,1,56,144Z" />
    </svg>
  );
}


// ---------------------------------------------------------------------------
// Shared text styles
// ---------------------------------------------------------------------------

const primaryValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  fontWeight: 600,
  fontSize: 'var(--text-secondary)',
  color: 'var(--foreground)',
  fontFeatureSettings: '"tnum"',
  lineHeight: 1.2,
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  fontWeight: 400,
  fontSize: 'var(--text-label)',
  color: 'var(--muted-foreground)',
  lineHeight: 1.2,
};

const secondaryValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  fontWeight: 400,
  fontSize: 'var(--text-secondary)',
  color: 'var(--foreground)',
  fontFeatureSettings: '"tnum"',
  lineHeight: 1.2,
  marginTop: '0.15rem',
};

// ---------------------------------------------------------------------------
// Legacy props interface — kept for any non-Now-page callers.
// ---------------------------------------------------------------------------

export interface PrecipitationCardProps {
  observation: Observation | null;
  units?: UnitsBlock | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Core render logic (shared by both prop shapes)
// ---------------------------------------------------------------------------

function PrecipitationCardContent({
  observation,
  units,
  loading = false,
  error = null,
}: Omit<PrecipitationCardProps, 'onRetry'>) {
  const { t, i18n } = useTranslation('now');

  // Keep this card self-contained: its daily total comes from the archive,
  // never from another card or the latest one-minute archive record.
  const { data: station } = useStation();
  const archiveStart24h = observation
    ? new Date(new Date(observation.timestamp).getTime() - 24 * 60 * 60 * 1000).toISOString()
    : undefined;
  const {
    data: precipitationArchive,
    stationClock,
    loading: archiveLoading,
    error: archiveError,
  } = useArchive(
    { from: archiveStart24h, fields: 'rain' },
    { skip: archiveStart24h === undefined },
  );
  const stationDate = stationClock ? getStationDate({ stationClock }) : undefined;
  const precipitationStats = useTodayStats(
    observation,
    precipitationArchive,
    stationDate,
    station?.timezone,
  );

  const rainCV = asConverted(observation?.rain ?? null);
  const rainFormatted = precipitationStats
    ? formatValue(precipitationStats.rainSoFar, 'rain', i18n.language)
    : '—';

  const rainRateCV = asConverted(observation?.rainRate ?? null);
  const rainRateFormatted = rainRateCV?.formatted ?? '—';

  const snowCV = asConverted(observation?.snow ?? null);
  const snowFormatted = snowCV?.formatted ?? '—';
  const snowVal = snowCV?.value ?? null;

  const snowRateCV = asConverted(observation?.snowRate ?? null);
  const snowRateFormatted = snowRateCV?.formatted ?? '—';

  const dewpointCV = asConverted(observation?.dewpoint ?? null);
  const dewpointFormatted = dewpointCV?.formatted ?? '—';

  const humidityCV = asConverted(observation?.outHumidity ?? null);
  const humidityFormatted = humidityCV?.formatted ?? '—';

  const rainLabel = rainCV?.label ?? units?.rain ?? '';
  const rainRateLabel = rainRateCV?.label ?? units?.rainRate ?? '';
  const dewpointLabel = dewpointCV?.label ?? units?.dewpoint ?? '';
  const humidityLabel = humidityCV?.label ?? units?.outHumidity ?? '%';
  const snowLabel = snowCV?.label ?? units?.snow ?? '';
  const snowRateLabel = snowRateCV?.label ?? units?.snowRate ?? '';

  return (
    <Card footprint="tile" aria-busy={loading || archiveLoading}>
      <CardHeader>
        <CardTitle as="h2">{t('precipitationCard.title')}</CardTitle>
      </CardHeader>

      <CardContent className="justify-center">
        {loading || archiveLoading ? (
          <>
            <span className="sr-only" role="status">{t('loading.precipitation')}</span>
            <PrecipitationSkeleton />
          </>
        ) : error || archiveError ? (
          <p
            role="alert"
            className="text-muted-foreground"
            style={{ fontSize: 'var(--text-body)' }}
          >
            {t('error.precipitation')}
          </p>
        ) : (
          <div
            aria-live="polite"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              gap: '1.5rem',
            }}
          >
            {/* Left column: Rain */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <DropIcon size={36} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <span style={primaryValueStyle}>{rainFormatted}{rainLabel}</span>
                <span style={labelStyle}>{t('precipitationCard.rainTodayLabel')}</span>
                <span style={secondaryValueStyle}>{rainRateFormatted}{rainRateLabel}</span>
                <span style={labelStyle}>{t('precipitationCard.rainRateLabel')}</span>
              </div>
            </div>

            {/* Right column: Dewpoint + Humidity */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <DropHalfIcon size={36} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <span style={primaryValueStyle}>{dewpointFormatted}{dewpointLabel}</span>
                <span style={labelStyle}>{t('observations.dewpoint')}</span>
                <span style={secondaryValueStyle}>{humidityFormatted}{humidityLabel}</span>
                <span style={labelStyle}>{t('observations.humidity')}</span>
              </div>
            </div>

            {/* Snow section — only shown when snow > 0 */}
            {snowVal !== null && snowVal > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <SnowflakeIcon size={36} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <span style={primaryValueStyle}>{snowFormatted}{snowLabel}</span>
                  <span style={labelStyle}>{t('precipitationCard.snowTodayLabel', 'Snow Today')}</span>
                  {snowRateCV !== null && (
                    <>
                      <span style={secondaryValueStyle}>{snowRateFormatted}{snowRateLabel}</span>
                      <span style={labelStyle}>{t('precipitationCard.snowRateLabel', 'Snow Rate')}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DataBag-aware component (CardComponentProps — T0B.2 contract)
// ---------------------------------------------------------------------------

export function PrecipitationCard(props: CardComponentProps): React.ReactElement;
export function PrecipitationCard(props: PrecipitationCardProps): React.ReactElement;
export function PrecipitationCard(props: CardComponentProps | PrecipitationCardProps): React.ReactElement {
  if ('dataBag' in props) {
    // DataBag path — self-extract from /api/v1/current
    const currentData = props.dataBag['/api/v1/current'] as {
      data?: Observation | null;
      units?: UnitsBlock | null;
      loading?: boolean;
      error?: unknown;
    } | undefined;
    return (
      <PrecipitationCardContent
        observation={currentData?.data ?? null}
        units={currentData?.units ?? null}
        loading={currentData?.loading ?? true}
        error={currentData?.error ? 'error' : null}
      />
    );
  }
  // Legacy path — explicit props
  return (
    <PrecipitationCardContent
      observation={props.observation}
      units={props.units}
      loading={props.loading}
      error={props.error}
    />
  );
}

export default PrecipitationCard;
