import api from './client';

export const getMyComments = async () => {
  const res = await api.get('/my-comments');
  return res.data;
};

export const deleteComment = async (id: number) => {
  await api.delete(`/comments/${id}`);
};

export const updateComment = async (id: number, content: string) => {
  const res = await api.put(`/comments/${id}`, { content });
  return res.data;
}; 