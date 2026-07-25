"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

import {
  CONSENT_EVENT,
  readConsent,
  type ConsentState,
} from "@/lib/analytics/events";

/**
 * Loads analytics and marketing tags only after the visitor has consented and
 * only when the corresponding environment variable is configured. Nothing is
 * requested on a first visit before a choice is made.
 */
export function AnalyticsProvider() {
  const [consent, setConsent] = useState<ConsentState | null>(null);

  useEffect(() => {
    setConsent(readConsent());

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ConsentState>).detail;
      setConsent(detail ?? readConsent());
    };

    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  if (!consent) return null;

  const ga = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const gtm = process.env.NEXT_PUBLIC_GTM_ID;
  const clarity = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
  const metaPixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const linkedIn = process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID;

  return (
    <>
      {consent.analytics && gtm ? (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');`}
        </Script>
      ) : null}

      {consent.analytics && ga ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga}`}
            strategy="afterInteractive"
          />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('consent','default',{ad_storage:'${
              consent.marketing ? "granted" : "denied"
            }',ad_user_data:'${consent.marketing ? "granted" : "denied"}',ad_personalization:'${
              consent.marketing ? "granted" : "denied"
            }',analytics_storage:'granted'});gtag('config','${ga}',{anonymize_ip:true,send_page_view:true});`}
          </Script>
        </>
      ) : null}

      {consent.analytics && clarity ? (
        <Script id="clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarity}");`}
        </Script>
      ) : null}

      {consent.marketing && metaPixel ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaPixel}');fbq('track','PageView');`}
        </Script>
      ) : null}

      {consent.marketing && linkedIn ? (
        <Script id="linkedin-insight" strategy="afterInteractive">
          {`_linkedin_partner_id="${linkedIn}";window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push(_linkedin_partner_id);(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s);})(window.lintrk);`}
        </Script>
      ) : null}
    </>
  );
}
