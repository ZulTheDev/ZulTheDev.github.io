import Giscus from '@giscus/react';

export default function GiscusComments({
  discussionTerm,
}) {
  return (
    <section className="portfolio-comments">
      <div className="portfolio-comments-header">
        <span className="comments-kicker">
          DISCUSSION // COMMUNITY
        </span>

        <h3>
          Discuss this item
        </h3>

        <p>
          Questions, feedback, corrections,
          or thoughts about this portfolio
          item can be shared through GitHub.
        </p>
      </div>

      <Giscus
        repo="ZulTheDev/ZulTheDev.github.io"
        repoId="R_kgDOQ7JCjA"

        category="General"
        categoryId="DIC_kwDOQ7JCjM4DG4UY"

        mapping="specific"
        term={discussionTerm}
        strict="1"

        reactionsEnabled="1"
        emitMetadata="0"

        inputPosition="top"

        theme="dark"
        lang="en"

        loading="lazy"
      />
    </section>
  );
}