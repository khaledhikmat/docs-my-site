import React from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './styles.module.css';

const features = [
  {
    title: 'Kubernetes vs. Service Fabric',
    imageUrl: 'img/undraw_docusaurus_mountain.svg',
    blogUrl: 'blog/2018/01/06/kubernetes-vs-service-fabric',
    description: (
      <>
        A prediction on the future of Microsoft Service Fabric.
      </>
    ),
  },
  {
    title: '.NET Core, Docker and Kubernetes',
    imageUrl: 'img/undraw_docusaurus_tree.svg',
    blogUrl: 'blog/2018/01/04/netapp-docker-k8s',
    description: (
      <>
        Check out how you can use .NET Core in Kubernetes
      </>
    ),
  },
  {
    title: 'Actors in Serverless',
    imageUrl: 'img/undraw_docusaurus_react.svg',
    blogUrl: 'blog/2017/12/27/durable-functions',
    description: (
      <>
        Model actors in Azure Functions.
      </>
    ),
  },
];

function Feature({imageUrl, blogUrl, title, description}) {
  const imgUrl = useBaseUrl(imageUrl);
  const blgUrl = useBaseUrl(blogUrl);
  return (
    <div className={clsx('col col--4', styles.feature)}>
      {imgUrl && (
        <div className="text--center">
          <img className={styles.featureImage} src={imgUrl} alt={title} />
        </div>
      )}
      {blgUrl && (
        <a href={blgUrl}>
          <h3>{title}</h3>
        </a>
      )}
      <p>{description}</p>
    </div>
  );
}

function Home() {
  const context = useDocusaurusContext();
  const {siteConfig = {}} = context;
  return (
    <Layout
      title={`Hello from ${siteConfig.title}`}
      description="Description will go into a meta tag in <head />">
      <header className={clsx('hero hero--primary', styles.heroBanner)}>
        <div className="container">
          <h1 className="hero__title">{siteConfig.title}</h1>
          <p className="hero__subtitle">{siteConfig.tagline}</p>
          <div className={styles.buttons}>
            <Link
              className={clsx(
                'button button--outline button--secondary button--lg',
                styles.getStarted,
              )}
              to={useBaseUrl('blog/tags/')}>
              Check Blog Posts
            </Link>
          </div>
        </div>
      </header>
      <main>
        {features && features.length > 0 && (
          <section className={styles.features}>
            <div className="container">
              <div className="row">
                {features.map((props, idx) => (
                  <Feature key={idx} {...props} />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </Layout>
  );
}

export default Home;
