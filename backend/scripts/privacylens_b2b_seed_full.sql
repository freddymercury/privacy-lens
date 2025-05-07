-- =============================================================
-- PrivacyLens – Seed Script (overwrite on conflict, dedup safe)
-- Paste into Supabase SQL editor or run via psql -f.
-- =============================================================

BEGIN;

-- 1. Ensure table exists -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.unassessed_urls (
    url text PRIMARY KEY,
    first_recorded timestamptz DEFAULT now(),
    status text DEFAULT 'pending',
    suggested_policy_urls jsonb DEFAULT '[]'::jsonb
);

-- 2A. High‑priority vendors (50) --------------------------------------------
INSERT INTO public.unassessed_urls (url, status)
VALUES
  ('aws.amazon.com','pending'),
  ('cloud.google.com','pending'),
  ('azure.microsoft.com','pending'),
  ('openai.com','pending'),
  ('anthropic.com','pending'),
  ('huggingface.co','pending'),
  ('stability.ai','pending'),
  ('github.com','pending'),
  ('gitlab.com','pending'),
  ('atlassian.com','pending'),
  ('slack.com','pending'),
  ('zoom.us','pending'),
  ('dropbox.com','pending'),
  ('notion.so','pending'),
  ('airtable.com','pending'),
  ('figma.com','pending'),
  ('monday.com','pending'),
  ('asana.com','pending'),
  ('zapier.com','pending'),
  ('trello.com','pending'),
  ('snowflake.com','pending'),
  ('datadoghq.com','pending'),
  ('cloudflare.com','pending'),
  ('okta.com','pending'),
  ('auth0.com','pending'),
  ('sentry.io','pending'),
  ('elastic.co','pending'),
  ('stripe.com','pending'),
  ('paypal.com','pending'),
  ('squareup.com','pending'),
  ('brex.com','pending'),
  ('sofi.com','pending'),
  ('google.com','pending'),
  ('facebook.com','pending'),
  ('linkedin.com','pending'),
  ('twitter.com','pending'),
  ('tiktok.com','pending'),
  ('snap.com','pending'),
  ('pinterest.com','pending'),
  ('reddit.com','pending'),
  ('epic.com','pending'),
  ('oracle.com','pending'),
  ('nexhealth.com','pending'),
  ('doxy.me','pending'),
  ('zendesk.com','pending'),
  ('workday.com','pending'),
  ('gusto.com','pending'),
  ('greenhouse.io','pending'),
  ('replit.com','pending'),
  ('vercel.com','pending'),
  ('ghost.org','pending')
ON CONFLICT (url) DO UPDATE SET first_recorded = now();

-- 2B. Enterprise vendors -----------------------------------------------------
WITH extra(url) AS (
  SELECT DISTINCT UNNEST(ARRAY[
    'abbyy.com','acquia.com','adp.com','aircall.io','alkami.com','allocadia.com','alteryx.com','amazon.com','assembla.com',
    'autodesk.com','avanan.com','avature.net','aver.com','axway.com','basecamp.com','bigcommerce.com','bill.com','blackducksoftware.com','blackline.com',
    'blackbaud.com','blastpoint.ai','bluejeans.com','boxever.com','brightcove.com','canto.com','castoredc.com','celonis.com','chargebee.com','checkr.com',
    'circleci.com','cisco.com','clarabridge.com','clari.com','clarizen.com','clickhouse.com','clio.com','cloudbees.com','clumio.com','cockroachlabs.com',
    'concur.com','contentsquare.com','couchbase.com','coupa.com','coursera.org','cradlepoint.com','cylance.com','cybereason.com','dataminr.com','datastax.com',
    'delphix.com','delinea.com','demodesk.com','digitalguardian.com','docusign.net','domo.com','drata.com','druva.com','egnyte.com','elasticpath.com',
    'enterprise.wework.com','envoy.com','episerver.com','everbridge.com','exacttarget.com','expensify.com','fastly.com','firebolt.io','fireeye.com','fiserv.com',
    'five9.com','freshbooks.com','frontapp.com','funnel.io','fusionauth.io','gitguardian.com','gitpod.io','gladly.com','globant.com','godaddy.com',
    'grafana.com','gravitational.com','greenplum.org','groovehq.com','gtmhub.com','harvestapp.com','hellosign.com','henryscheinone.com','highspot.com','honeycomb.io',
    'hyperscience.com','iglu.com','illumin.io','influxdata.com','instructure.com','jamf.com','jellyfish.co','jirav.com','jumio.com','kaseya.com',
    'kayako.com','keyfactor.com','kii.com','knime.com','konghq.com','kustomer.com','launchdarkly.com','leanix.net','leanplum.com','lendingclub.com',
    'lightspeedhq.com','linode.com','logicmonitor.com','lookout.com','lumen.com','mailerlite.com','marklogic.com','matillion.com','medallia.com','meltwater.com',
    'meraki.cisco.com','mulesoft.com','mural.co','nanit.com','nasuni.com','natera.com','netskope.com','netsuite.com','newrelic.com','nvidia.com',
    'observeinc.com','omniture.com','onelogin.com','oraclecloud.com','pagerduty.com','palantir.com','pantheon.io','payscale.com','perimeter81.com',
    'periscope.io','pingidentity.com','planview.com','plex.com','postgresql.org','proofpoint.com','qualys.com','quantcast.com','quantummetric.com','qubit.com',
    'rackspace.com','rapid7.com','raygun.com','reachdesk.com','rescale.com','ringcentral.com','rubrik.com','salesloft.com','secureauth.com','segment.com',
    'semrush.com','sendbird.com','servicechannel.com','sila.com','signalfx.com','silverstripe.com','simplelegal.com','skillsoft.com','snowsoftware.com','solarisbank.com',
    'sonatype.com','springcm.com','sprinklr.com','splunk.com','sproutloud.com','sumologic.com','surveygizmo.com','swimlane.com','sybase.com','tableau.com',
    'talend.com','tanium.com','terraform.io','thousandeyes.com','threatstack.com','tigera.io','tipalti.com','trifacta.com','trilio.io','trinet.com',
    'ubiquity.com','udacity.com','userpilot.com','verizon.com','vmware.com','webex.com','workato.com','workiva.com','wrike.com','xero.com',
    'zscaler.com','zoominfo.com','databricks.com','confluent.io','calendly.com','mailgun.com','sendgrid.com','postman.com','rapidapi.com',
    'algolia.com','digitalocean.com','heroku.com','render.com','fly.io','netlify.com','datadome.co','cloudinary.com','imgix.com','bigquery.cloud.google.com',
    'snowplowanalytics.com','keen.io','logz.io','airbyte.com','fivetran.com','mailchimp.com','sendinblue.com','marketo.com','pendo.io','heap.io',
    'fullstory.com','hotjar.com','crazyegg.com','klarity.com','onetrust.com','trustarc.com','privacyshield.gov','ycombinator.com','producthunt.com','configcat.com',
    'split.io','toggl.com','wise.com','square.com','typeform.com','surveymonkey.com','qualtrics.com','figshare.com','getpocket.com','medium.com',
    'substack.com','beehiiv.com','buffer.com','later.com','hootsuite.com','sproutsocial.com','sketch.com','canva.com','adobe.com','coursera.org/business',
    'udemy.com','pluralsight.com','codecademy.com','duolingo.com','mixpanel.com','amplitude.com'
  ])
)
INSERT INTO public.unassessed_urls (url, status)
SELECT url, 'pending' FROM extra
ON CONFLICT (url) DO UPDATE SET first_recorded = now();

COMMIT;

SELECT COUNT(*) AS total FROM public.unassessed_urls;
