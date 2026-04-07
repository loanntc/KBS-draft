'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import PostCard from '@/components/post/PostCard'
import { Post } from '@/types'

interface PostDetailClientProps {
  post: Post
  currentUserId: string
}

export default function PostDetailClient({ post: initialPost, currentUserId }: PostDetailClientProps) {
  const router = useRouter()
  const [post, setPost] = useState<Post>(initialPost)

  const handleDelete = () => {
    router.push('/community')
  }

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 px-2 h-14">
          <button onClick={() => router.back()} className="p-2 text-gray-700">
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-base font-bold text-gray-900">게시글</h1>
        </div>
      </header>

      {/* Post Card */}
      <div className="border-b border-gray-100">
        <PostCard
          post={post}
          currentUserId={currentUserId}
          onUpdate={setPost}
          onDelete={handleDelete}
        />
      </div>

      {/* Comment section label */}
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">
          댓글 {post.commentCount > 0 ? post.commentCount : ''}
        </h2>
      </div>
    </>
  )
}
