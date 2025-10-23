/**
 * Comment List component stub
 */

import React from 'react';

interface Comment {
  id: string;
  text: string;
  author: string;
  [key: string]: any;
}

interface CommentListProps {
  templateId: string | number;
  comments: Comment[];
}

export default function CommentList({ templateId, comments }: CommentListProps) {
  return (
    <div className="comment-list">
      <h3>Comments</h3>
      {comments?.map(comment => (
        <div key={comment.id} className="comment">
          <p>{comment.text}</p>
          <small>{comment.author}</small>
        </div>
      ))}
    </div>
  );
}
